#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const fixturePath = join(
  repositoryRoot,
  "demo/fixtures/stem-evaluation-v1.json",
);
const resultsRoot = join(repositoryRoot, "demo/results");
const args = process.argv.slice(2);
const modeIndex = args.indexOf("--mode");
const mode = modeIndex === -1 ? "mock" : args[modeIndex + 1];
const selectedTts = ttsConfiguration();

if (!["mock", "live"].includes(mode)) {
  throw new Error("Demo mode must be mock or live.");
}

const fixtureSet = JSON.parse(await readFile(fixturePath, "utf8"));
const rootPackage = JSON.parse(
  await readFile(join(repositoryRoot, "package.json"), "utf8"),
);
validateFixtures(fixtureSet);
if (mode === "live") validateLiveConfiguration();

const timestamp = new Date();
const evaluationRunId = `${mode}-${timestamp
  .toISOString()
  .replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const outputDirectory = join(resultsRoot, evaluationRunId);
await mkdir(resultsRoot, { recursive: true });
await mkdir(outputDirectory, { recursive: false });

const manifest = buildManifest(fixtureSet, evaluationRunId, timestamp, mode);
const results = [];
for (const [index, fixture] of fixtureSet.fixtures.entries()) {
  try {
    results.push(
      mode === "mock" ? mockResult(fixture, index) : await liveResult(fixture),
    );
  } catch {
    results.push(failedResult(fixture, "HARNESS_FIXTURE_FAILURE"));
  }
}

const aggregates = aggregate(results);
const payload = {
  evaluationRunId,
  mode,
  generatedAt: timestamp.toISOString(),
  fixtureVersion: fixtureSet.fixtureVersion,
  resultCount: results.length,
  aggregates,
  results,
  scope: {
    evaluationType: "system-level",
    studentStudy: false,
    learningEffectivenessClaimed: false,
    verifierIsHumanValidation: false,
    manualAuthorReviewIncluded: false,
  },
};

await Promise.all([
  writeJson(join(outputDirectory, "manifest.json"), manifest),
  writeJson(join(outputDirectory, "results.json"), payload),
  writeFile(join(outputDirectory, "results.csv"), toCsv(results), "utf8"),
  writeFile(
    join(outputDirectory, "chapter-4-summary.md"),
    toMarkdown(payload, manifest),
    "utf8",
  ),
  writeJson(
    join(outputDirectory, "manual-grounding-review.json"),
    manualReviewTemplate(evaluationRunId, results),
  ),
]);

process.stdout.write(
  `Demo ${mode} evaluation complete: ${evaluationRunId}\n` +
    `Results: ${outputDirectory}\n` +
    `Fixtures: ${results.length}; disposition accuracy: ${formatRate(
      aggregates.dispositionAccuracy,
    )}\n`,
);

function validateFixtures(value) {
  if (
    !value ||
    typeof value.fixtureVersion !== "string" ||
    !Array.isArray(value.fixtures) ||
    value.fixtures.length < 10
  ) {
    throw new Error(
      "Fixture set must contain a version and at least 10 fixtures.",
    );
  }
  const ids = new Set();
  const categoryCounts = {};
  for (const fixture of value.fixtures) {
    const requiredStrings = [
      "id",
      "question",
      "language",
      "expectedDisposition",
      "groundTruthJustification",
    ];
    if (requiredStrings.some((field) => typeof fixture[field] !== "string")) {
      throw new Error("Every fixture must contain the required stable fields.");
    }
    if (fixture.language !== "en") {
      throw new Error(`Fixture ${fixture.id} is outside English P0.`);
    }
    if (!["completed", "refused"].includes(fixture.expectedDisposition)) {
      throw new Error(`Fixture ${fixture.id} has an invalid disposition.`);
    }
    if (
      !Array.isArray(fixture.requiredConcepts) ||
      !Array.isArray(fixture.forbiddenUnsupportedClaims) ||
      !Array.isArray(fixture.expectedEvidence?.chunkIds) ||
      typeof fixture.asrInvolved !== "boolean"
    ) {
      throw new Error(`Fixture ${fixture.id} has incomplete expectations.`);
    }
    if (ids.has(fixture.id))
      throw new Error(`Duplicate fixture ID ${fixture.id}.`);
    ids.add(fixture.id);
    categoryCounts[fixture.category] =
      (categoryCounts[fixture.category] ?? 0) + 1;
  }
  if (
    categoryCounts.supported < 6 ||
    categoryCounts.out_of_syllabus < 2 ||
    categoryCounts.misspelling_or_conversational < 1 ||
    categoryCounts.related_insufficient_evidence < 1
  ) {
    throw new Error("Fixture category minimums are not satisfied.");
  }
}

function validateLiveConfiguration() {
  if (process.env.DEMO_LIVE_CONFIRM !== "YES") {
    throw new Error("Live mode requires DEMO_LIVE_CONFIRM=YES.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Live mode requires the server-side OpenAI credential.");
  }
  if (
    selectedTts.provider === "naijalingo" &&
    !process.env.NAIJALINGO_API_KEY
  ) {
    throw new Error("Live 9jaLingo mode requires NAIJALINGO_API_KEY.");
  }
  if (
    selectedTts.provider === "elevenlabs" &&
    (!process.env.ELEVEN_LABS_API_KEY ||
      !process.env.ELEVEN_LABS_VOICE_ID ||
      !process.env.ELEVEN_LABS_VOICE_NAME)
  ) {
    throw new Error(
      "Live ElevenLabs mode requires its server-side key, voice ID, and safe voice display name.",
    );
  }
  if (selectedTts.provider === "yarngpt" && !process.env.YARN_GPT_API_KEY) {
    throw new Error("Live YarnGPT mode requires its server-side credential.");
  }
}

function ttsConfiguration() {
  const provider = process.env.TTS_PROVIDER ?? "naijalingo";
  if (provider === "naijalingo") {
    const voice = process.env.NAIJALINGO_VOICE_PCM || "ada_pcm";
    return {
      provider,
      apiVersion: "v1",
      model: process.env.NAIJALINGO_MODEL || "9jalingo-tts-1",
      voiceId: voice,
      voice,
      format: "wav",
      pricingVersion: process.env.NAIJALINGO_PRICING_VERSION || "unconfigured",
      pricingCurrency: process.env.NAIJALINGO_PRICING_CURRENCY || "NGN",
      pricingEffectiveDate:
        process.env.NAIJALINGO_PRICING_EFFECTIVE_DATE || null,
      ratePerThousandCharacters: optionalNumber(
        process.env.NAIJALINGO_COST_PER_1000_CHARACTERS,
      ),
      maxInputCharacters: Math.min(
        numberEnv("NAIJALINGO_MAX_INPUT_CHARACTERS", 8_000),
        16_000,
      ),
    };
  }
  if (provider === "elevenlabs") {
    return {
      provider,
      apiVersion: "v1",
      model: process.env.ELEVEN_LABS_MODEL_ID ?? "eleven_flash_v2_5",
      voiceId: process.env.ELEVEN_LABS_VOICE_ID || null,
      voice:
        process.env.ELEVEN_LABS_VOICE_NAME || "Unselected ElevenLabs voice",
      format: process.env.ELEVEN_LABS_OUTPUT_FORMAT ?? "mp3_44100_128",
      pricingVersion:
        process.env.ELEVEN_LABS_PRICING_VERSION || "api-pricing-2026-07-24",
      pricingCurrency: process.env.ELEVEN_LABS_PRICING_CURRENCY || "USD",
      pricingEffectiveDate:
        process.env.ELEVEN_LABS_PRICING_EFFECTIVE_DATE || "2026-07-24",
      ratePerThousandCharacters: optionalNumber(
        process.env.ELEVEN_LABS_COST_PER_1000_CHARACTERS || "0.05",
      ),
      maxInputCharacters: Math.min(
        numberEnv("ELEVEN_LABS_MAX_INPUT_CHARACTERS", 40_000),
        process.env.ELEVEN_LABS_MODEL_ID === "eleven_v3" ? 5_000 : 40_000,
        8_000,
      ),
    };
  }
  if (provider === "yarngpt") {
    return {
      provider,
      apiVersion: "v1",
      model: "yarngpt-tts-v1",
      voiceId: null,
      voice: process.env.YARN_GPT_VOICE ?? "Chinenye",
      format: process.env.YARN_GPT_RESPONSE_FORMAT ?? "mp3",
      pricingVersion:
        process.env.YARN_GPT_PRICING_VERSION ?? "unconfigured-2026-07-24",
      pricingCurrency: process.env.YARN_GPT_PRICING_CURRENCY ?? "NGN",
      pricingEffectiveDate: process.env.YARN_GPT_PRICING_EFFECTIVE_DATE || null,
      ratePerThousandCharacters: optionalNumber(
        process.env.YARN_GPT_COST_PER_1000_CHARACTERS,
      ),
      maxInputCharacters: Math.min(
        numberEnv("YARN_GPT_MAX_INPUT_CHARACTERS", 2_000),
        2_000,
      ),
    };
  }
  if (provider === "openai") {
    return {
      provider,
      apiVersion: "v1",
      model: process.env.TTS_MODEL ?? "gpt-4o-mini-tts-2025-12-15",
      voiceId: null,
      voice: process.env.TTS_VOICE ?? "cedar",
      format: process.env.TTS_FORMAT ?? "mp3",
      pricingVersion: process.env.VOICE_PRICING_VERSION ?? "2026-07-23",
      pricingCurrency: "USD",
      pricingEffectiveDate: process.env.VOICE_PRICING_VERSION ?? "2026-07-23",
      ratePerThousandCharacters: null,
      maxInputCharacters: Math.min(
        numberEnv("TTS_MAX_INPUT_CHARACTERS", 4_096),
        8_000,
      ),
    };
  }
  throw new Error(
    "TTS_PROVIDER must be one of naijalingo, elevenlabs, yarngpt, or openai.",
  );
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function buildManifest(fixtureSet, runId, timestamp, selectedMode) {
  return {
    evaluationRunId: runId,
    timestamp: timestamp.toISOString(),
    mode: selectedMode,
    git: {
      commit: gitValue(["rev-parse", "HEAD"], "uncommitted-no-head"),
      dirty: gitValue(["status", "--porcelain"], "").length > 0,
    },
    applicationVersion: rootPackage.version,
    fixtureVersion: fixtureSet.fixtureVersion,
    corpus: fixtureSet.corpus,
    retrieval: {
      threshold: numberEnv("TUTOR_RETRIEVAL_THRESHOLD", 0.65),
      topK: numberEnv("TUTOR_RETRIEVAL_LIMIT", 5),
    },
    providers: {
      tutor: process.env.TUTOR_MODEL ?? "gpt-5.6-terra",
      verifier: process.env.GROUNDING_VERIFIER_MODEL ?? "gpt-5.6-terra",
      queryTransformer: process.env.QUERY_TRANSFORMER_MODEL ?? "gpt-5.6-luna",
      embedding: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      asr: process.env.ASR_MODEL ?? "gpt-4o-mini-transcribe-2025-12-15",
      tts: selectedTts,
    },
    pricing: {
      version: selectedTts.pricingVersion,
      currency: selectedTts.pricingCurrency,
      effectiveDate: selectedTts.pricingEffectiveDate,
      rateConfigured: selectedTts.ratePerThousandCharacters !== null,
      unit: "per_1000_characters",
      costUnavailable: selectedTts.ratePerThousandCharacters === null,
      ratePerThousandCharacters: selectedTts.ratePerThousandCharacters,
      estimateOnly: true,
    },
    relevantConfiguration: {
      language: "en",
      ttsProvider: selectedTts.provider,
      ttsMaxInputCharacters: selectedTts.maxInputCharacters,
      noSecretsIncluded: true,
      externalCallsMade: selectedMode === "live",
    },
  };
}

function mockResult(fixture, index) {
  const completed = fixture.expectedDisposition === "completed";
  const boundary = fixture.category === "related_insufficient_evidence";
  const retrievedChunkIds =
    completed || boundary ? fixture.expectedEvidence.chunkIds : [];
  const latency = 1_800 + index * 137;
  const ttsLatency = completed ? 620 + index * 31 : null;
  const ttsCharacters = completed ? 900 + index * 37 : null;
  const ttsEstimatedCostRaw =
    ttsCharacters === null || selectedTts.ratePerThousandCharacters === null
      ? null
      : (ttsCharacters / 1_000) * selectedTts.ratePerThousandCharacters;
  const ttsEstimatedCost =
    ttsEstimatedCostRaw === null
      ? null
      : Number(ttsEstimatedCostRaw.toFixed(8));
  const ttsEstimatedUsd =
    selectedTts.pricingCurrency === "USD" ? ttsEstimatedCost : null;
  const tutorRunId = deterministicUuid(index);
  return scoreResult(fixture, {
    actualDisposition: fixture.expectedDisposition,
    tutorRunId,
    retrievedChunks: retrievedChunkIds.map((chunkId, chunkIndex) => ({
      chunkId,
      topic: fixture.expectedPersistedTopicLabel,
      locator: fixture.expectedEvidence.locators[chunkIndex] ?? null,
      sourceTitle: fixture.expectedSource?.title ?? null,
      documentId: fixture.expectedSource?.documentId ?? null,
      hybridScore: Number((0.91 - chunkIndex * 0.04).toFixed(4)),
    })),
    citations: completed
      ? retrievedChunkIds.map((chunkId, chunkIndex) => ({
          chunkId,
          sourceTitle: fixture.expectedSource.title,
          sourceLocator:
            fixture.expectedEvidence.locators[chunkIndex] ?? "locked locator",
        }))
      : [],
    grounding: completed
      ? { grounded: true, reasons: [], unsupportedClaims: [] }
      : {
          grounded: false,
          reasons: ["Deterministic refusal fixture."],
          unsupportedClaims: [],
        },
    revisions: index === 5 ? 1 : 0,
    stageLatenciesMs: {
      queryTransformation: 210 + index,
      retrieval: 180 + index,
      tutor: completed ? 620 + index * 3 : 0,
      verification: completed ? 430 + index * 2 : 0,
    },
    totalLatencyMs: latency + (ttsLatency ?? 0),
    asrLatencyMs: null,
    tts: completed
      ? {
          provider: selectedTts.provider,
          apiVersion: selectedTts.apiVersion,
          model: selectedTts.model,
          voiceId: selectedTts.voiceId,
          voice: selectedTts.voice,
          format: selectedTts.format,
          latencyMs: ttsLatency,
          synthesisSuccess: true,
          failureCode: null,
          characterCount: ttsCharacters,
          outputByteCount: 48_000 + index * 503,
          providerCharacterCost: null,
          estimatedCost: ttsEstimatedCost,
          pricingCurrency: selectedTts.pricingCurrency,
          pricingVersion: selectedTts.pricingVersion,
          pricingEffectiveDate: selectedTts.pricingEffectiveDate,
          pricingRatePerThousandCharacters:
            selectedTts.ratePerThousandCharacters,
          costStatus: ttsEstimatedCost === null ? "unavailable" : "estimated",
        }
      : {
          provider: selectedTts.provider,
          apiVersion: selectedTts.apiVersion,
          model: selectedTts.model,
          voiceId: selectedTts.voiceId,
          voice: selectedTts.voice,
          format: selectedTts.format,
          latencyMs: null,
          synthesisSuccess: null,
          failureCode: null,
          characterCount: null,
          outputByteCount: null,
          providerCharacterCost: null,
          estimatedCost: null,
          pricingCurrency: selectedTts.pricingCurrency,
          pricingVersion: selectedTts.pricingVersion,
          pricingEffectiveDate: selectedTts.pricingEffectiveDate,
          pricingRatePerThousandCharacters:
            selectedTts.ratePerThousandCharacters,
          costStatus: "unavailable",
        },
    tokens: {
      input: completed ? 2_400 + index * 41 : 350 + index * 11,
      output: completed ? 410 + index * 7 : 80,
      total: completed ? 2_810 + index * 48 : 430 + index * 11,
    },
    cost: {
      status:
        completed && ttsEstimatedUsd === null ? "unavailable" : "estimated",
      knownSubtotalUsd: Number(
        (
          (completed ? 0.012 + index * 0.0004 : 0.0012) + (ttsEstimatedUsd ?? 0)
        ).toFixed(8),
      ),
      estimatedTotal:
        completed && ttsEstimatedUsd === null
          ? null
          : Number(
              (
                (completed ? 0.012 + index * 0.0004 : 0.0012) +
                (ttsEstimatedUsd ?? 0)
              ).toFixed(8),
            ),
      currency: completed && ttsEstimatedUsd === null ? null : "USD",
      unavailableComponents:
        completed && ttsEstimatedUsd === null
          ? [`${selectedTts.provider}_tts`]
          : [],
    },
    safeError: null,
    reinforcementStatus: "not_evaluated",
  });
}

async function liveResult(fixture) {
  const origin = (
    process.env.DEMO_API_ORIGIN ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const response = await boundedFetch(`${origin}/api/tutor/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question: fixture.question,
      language: "en",
      preferredLanguage: "pcm",
    }),
  });
  if (!response.ok) {
    return failedResult(fixture, `TUTOR_HTTP_${response.status}`);
  }
  const run = await response.json();
  const eligibleForSpeech =
    run.status === "completed" &&
    run.grounding?.grounded === true &&
    run.refusal?.refused === false &&
    typeof run.finalAnswer === "string" &&
    run.finalAnswer.length > 0;
  let tts = {
    provider: selectedTts.provider,
    apiVersion: selectedTts.apiVersion,
    model: selectedTts.model,
    voiceId: selectedTts.voiceId,
    voice: selectedTts.voice,
    format: selectedTts.format,
    latencyMs: null,
    synthesisSuccess: null,
    failureCode: null,
    characterCount: null,
    outputByteCount: null,
    providerCharacterCost: null,
    estimatedCost: null,
    pricingCurrency: selectedTts.pricingCurrency,
    pricingVersion: selectedTts.pricingVersion,
    pricingEffectiveDate: selectedTts.pricingEffectiveDate,
    pricingRatePerThousandCharacters: selectedTts.ratePerThousandCharacters,
    costStatus: "unavailable",
  };
  if (eligibleForSpeech) {
    try {
      const speechResponse = await boundedFetch(
        `${origin}/api/tutor/runs/${run.runId}/speech`,
        { method: "POST" },
      );
      if (!speechResponse.ok) {
        tts = {
          ...tts,
          synthesisSuccess: false,
          failureCode: `TTS_HTTP_${speechResponse.status}`,
        };
      } else {
        const audio = await speechResponse.arrayBuffer();
        tts = {
          ...tts,
          provider:
            speechResponse.headers.get("x-tts-provider") ??
            selectedTts.provider,
          apiVersion:
            speechResponse.headers.get("x-tts-api-version") ??
            selectedTts.apiVersion,
          model: speechResponse.headers.get("x-tts-model") ?? selectedTts.model,
          voiceId:
            speechResponse.headers.get("x-tts-voice-id") ?? selectedTts.voiceId,
          voice: speechResponse.headers.get("x-tts-voice") ?? selectedTts.voice,
          format:
            speechResponse.headers.get("x-tts-format") ?? selectedTts.format,
          latencyMs: nullableHeaderNumber(speechResponse, "x-tts-latency-ms"),
          synthesisSuccess: true,
          failureCode: null,
          characterCount: nullableHeaderNumber(
            speechResponse,
            "x-tts-input-characters",
          ),
          outputByteCount: audio.byteLength,
          providerCharacterCost: nullableHeaderNumber(
            speechResponse,
            "x-tts-provider-character-cost",
          ),
          estimatedCost: nullableHeaderNumber(
            speechResponse,
            "x-tts-estimated-cost",
          ),
          pricingCurrency:
            speechResponse.headers.get("x-tts-pricing-currency") ??
            selectedTts.pricingCurrency,
          pricingVersion:
            speechResponse.headers.get("x-tts-pricing-version") ??
            selectedTts.pricingVersion,
          pricingEffectiveDate:
            speechResponse.headers.get("x-tts-pricing-effective-date") ??
            selectedTts.pricingEffectiveDate,
          pricingRatePerThousandCharacters: nullableHeaderNumber(
            speechResponse,
            "x-tts-pricing-rate-per-1000-characters",
          ),
          costStatus:
            speechResponse.headers.get("x-tts-cost-status") ?? "unavailable",
        };
      }
    } catch {
      tts = {
        ...tts,
        synthesisSuccess: false,
        failureCode: "TTS_REQUEST_FAILED",
      };
    }
  }
  const tutorCost = Number(run.metrics?.estimatedCostUsd ?? 0);
  const ttsUsd =
    tts.estimatedCost !== null && tts.pricingCurrency === "USD"
      ? tts.estimatedCost
      : null;
  return scoreResult(fixture, {
    actualDisposition:
      run.status === "completed"
        ? "completed"
        : run.status === "refused"
          ? "refused"
          : "failed",
    tutorRunId: run.runId ?? null,
    retrievedChunks: (run.retrievedChunks ?? []).map((chunk) => ({
      chunkId: chunk.chunkId,
      topic: chunk.topic?.label ?? null,
      locator: chunk.locator?.sourceLocator ?? null,
      sourceTitle: chunk.document?.sourceTitle ?? null,
      documentId: chunk.document?.id ?? null,
      hybridScore: chunk.hybridScore ?? null,
    })),
    citations: run.citations ?? [],
    grounding: run.grounding ?? null,
    revisions: run.metrics?.revisions ?? 0,
    stageLatenciesMs: stageLatencies(run.trace ?? []),
    totalLatencyMs:
      Number(run.metrics?.latencyMs ?? 0) + Number(tts.latencyMs ?? 0),
    asrLatencyMs: run.voiceMetrics?.asr?.latencyMs ?? null,
    tts,
    tokens: run.metrics?.tokens ?? { input: 0, output: 0, total: 0 },
    cost: {
      status:
        eligibleForSpeech && ttsUsd === null ? "unavailable" : "estimated",
      knownSubtotalUsd: tutorCost + (ttsUsd ?? 0),
      estimatedTotal:
        eligibleForSpeech && ttsUsd === null ? null : tutorCost + (ttsUsd ?? 0),
      currency: eligibleForSpeech && ttsUsd === null ? null : "USD",
      unavailableComponents:
        eligibleForSpeech && ttsUsd === null
          ? [`${selectedTts.provider}_tts`]
          : [],
    },
    safeError: run.errors?.[0]
      ? {
          stage: run.errors[0].stage,
          code: run.errors[0].code,
        }
      : null,
    reinforcementStatus: "not_evaluated",
  });
}

async function boundedFetch(url, init) {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const signal = AbortSignal.timeout(
      numberEnv("DEMO_REQUEST_TIMEOUT_MS", 60_000),
    );
    try {
      const response = await fetch(url, { ...init, signal });
      if (
        attempt < attempts &&
        (response.status === 429 || response.status >= 500)
      ) {
        continue;
      }
      return response;
    } catch {
      if (attempt === attempts) throw new Error("SAFE_DEMO_REQUEST_FAILURE");
    }
  }
  throw new Error("SAFE_DEMO_REQUEST_FAILURE");
}

function stageLatencies(trace) {
  const values = {};
  for (const event of trace) {
    if (event.type !== "agent.completed" || event.latencyMs === null) continue;
    values[event.stage] = (values[event.stage] ?? 0) + event.latencyMs;
  }
  return values;
}

function scoreResult(fixture, actual) {
  const retrievedIds = new Set(
    actual.retrievedChunks.map((chunk) => chunk.chunkId),
  );
  const retrievedTopics = [
    ...new Set(
      actual.retrievedChunks.map((chunk) => chunk.topic).filter(Boolean),
    ),
  ];
  const expectedSourceHit =
    fixture.expectedSource === null
      ? actual.retrievedChunks.length === 0
      : actual.retrievedChunks.some(
          (chunk) =>
            chunk.documentId === fixture.expectedSource.documentId ||
            chunk.sourceTitle === fixture.expectedSource.title,
        );
  const citations = actual.citations ?? [];
  const citationIntegrity =
    actual.actualDisposition === "completed"
      ? citations.length > 0 &&
        citations.every((citation) => retrievedIds.has(citation.chunkId))
      : null;
  return {
    fixtureId: fixture.id,
    category: fixture.category,
    question: fixture.question,
    language: fixture.language,
    asrInvolved: fixture.asrInvolved,
    expectedDisposition: fixture.expectedDisposition,
    actualDisposition: actual.actualDisposition,
    dispositionCorrect:
      fixture.expectedDisposition === actual.actualDisposition,
    tutorRunId: actual.tutorRunId,
    retrievedChunks: actual.retrievedChunks,
    retrievedChunkIds: [...retrievedIds],
    retrievedTopics,
    retrievalScores: actual.retrievedChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      hybridScore: chunk.hybridScore,
    })),
    expectedSourceHit,
    expectedChunkHit: fixture.expectedEvidence.chunkIds.some((id) =>
      retrievedIds.has(id),
    ),
    refusalResult: {
      expected: fixture.expectedDisposition === "refused",
      actual: actual.actualDisposition === "refused",
      correct:
        (fixture.expectedDisposition === "refused") ===
        (actual.actualDisposition === "refused"),
    },
    citationIntegrity: {
      structural: citationIntegrity,
      verifierJudgement: actual.grounding?.grounded ?? false,
      manualAuthorEvidenceReview: "not_reviewed",
    },
    groundingVerifier: actual.grounding,
    revisionCount: actual.revisions,
    stageLatenciesMs: actual.stageLatenciesMs,
    totalLatencyMs: actual.totalLatencyMs,
    asrLatencyMs: actual.asrLatencyMs,
    tts: actual.tts,
    tokenUsage: actual.tokens,
    estimatedCost: actual.cost,
    safeError: actual.safeError,
    reinforcementStatus: actual.reinforcementStatus,
  };
}

function failedResult(fixture, code) {
  return scoreResult(fixture, {
    actualDisposition: "failed",
    tutorRunId: null,
    retrievedChunks: [],
    citations: [],
    grounding: null,
    revisions: 0,
    stageLatenciesMs: {},
    totalLatencyMs: 0,
    asrLatencyMs: null,
    tts: {
      provider: selectedTts.provider,
      apiVersion: selectedTts.apiVersion,
      model: selectedTts.model,
      voiceId: selectedTts.voiceId,
      voice: selectedTts.voice,
      format: selectedTts.format,
      latencyMs: null,
      synthesisSuccess: null,
      failureCode: null,
      characterCount: null,
      outputByteCount: null,
      providerCharacterCost: null,
      estimatedCost: null,
      pricingCurrency: selectedTts.pricingCurrency,
      pricingVersion: selectedTts.pricingVersion,
      pricingEffectiveDate: selectedTts.pricingEffectiveDate,
      pricingRatePerThousandCharacters: selectedTts.ratePerThousandCharacters,
      costStatus: "unavailable",
    },
    tokens: { input: 0, output: 0, total: 0 },
    cost: {
      status: "unavailable",
      knownSubtotalUsd: 0,
      estimatedTotal: null,
      currency: null,
      unavailableComponents: ["failed_run"],
    },
    safeError: { stage: "evaluation", code },
    reinforcementStatus: "not_evaluated",
  });
}

function aggregate(results) {
  const expectedCompletions = results.filter(
    (result) => result.expectedDisposition === "completed",
  );
  const expectedRefusals = results.filter(
    (result) => result.expectedDisposition === "refused",
  );
  const evidenceExpected = results.filter(
    (result) =>
      result.expectedDisposition === "completed" ||
      result.category === "related_insufficient_evidence",
  );
  const actualCompletions = results.filter(
    (result) => result.actualDisposition === "completed",
  );
  const ttsAttempts = results.filter(
    (result) => result.tts.synthesisSuccess !== null,
  );
  const successfulTts = ttsAttempts.filter(
    (result) => result.tts.synthesisSuccess === true,
  );
  const expectedVoiceSuccesses = expectedCompletions.filter(
    (result) => result.tts.synthesisSuccess === true,
  );
  const knownCosts = results
    .filter((result) => result.estimatedCost.status === "estimated")
    .map((result) => result.estimatedCost.estimatedTotal);
  return {
    fixtureCount: results.length,
    failedRunCount: results.filter(
      (result) => result.actualDisposition === "failed",
    ).length,
    dispositionAccuracy: rate(
      results.filter((result) => result.dispositionCorrect).length,
      results.length,
    ),
    retrievalHitRate: rate(
      evidenceExpected.filter((result) => result.expectedSourceHit).length,
      evidenceExpected.length,
    ),
    correctRefusalRate: rate(
      expectedRefusals.filter(
        (result) => result.actualDisposition === "refused",
      ).length,
      expectedRefusals.length,
    ),
    incorrectRefusalRate: rate(
      expectedCompletions.filter(
        (result) => result.actualDisposition === "refused",
      ).length,
      expectedCompletions.length,
    ),
    citationIntegrityRate: rate(
      expectedCompletions.filter(
        (result) => result.citationIntegrity.structural === true,
      ).length,
      expectedCompletions.length,
    ),
    groundedCompletionRate: rate(
      expectedCompletions.filter(
        (result) =>
          result.actualDisposition === "completed" &&
          result.citationIntegrity.verifierJudgement === true,
      ).length,
      expectedCompletions.length,
    ),
    revisionRate: rate(
      results.filter((result) => result.revisionCount > 0).length,
      results.length,
    ),
    latencyMs: {
      median: percentile(
        results.map((result) => result.totalLatencyMs),
        0.5,
      ),
      p95: percentile(
        results.map((result) => result.totalLatencyMs),
        0.95,
      ),
    },
    cost: {
      status: results.some(
        (result) => result.estimatedCost.status === "unavailable",
      )
        ? "partially_unavailable"
        : "estimated",
      medianEstimated: results.some(
        (result) => result.estimatedCost.status === "unavailable",
      )
        ? null
        : percentile(knownCosts, 0.5),
      medianKnownSubtotalUsd: percentile(
        results.map((result) => result.estimatedCost.knownSubtotalUsd),
        0.5,
      ),
      totalEstimated: results.some(
        (result) => result.estimatedCost.status === "unavailable",
      )
        ? null
        : Number(knownCosts.reduce((sum, value) => sum + value, 0).toFixed(8)),
      totalKnownSubtotalUsd: Number(
        results
          .reduce(
            (sum, result) => sum + result.estimatedCost.knownSubtotalUsd,
            0,
          )
          .toFixed(8),
      ),
      unavailableRunCount: results.filter(
        (result) => result.estimatedCost.status === "unavailable",
      ).length,
    },
    providerFailureCount: results.filter(
      (result) =>
        result.tts.synthesisSuccess === false || result.safeError !== null,
    ).length,
    ttsProvider: selectedTts.provider,
    ttsEligibleFixtureCount: ttsAttempts.length,
    externalTtsCallCount: mode === "mock" ? 0 : ttsAttempts.length,
    ttsSynthesisSuccessRate: rate(successfulTts.length, ttsAttempts.length),
    endToEndVoiceSuccessRate: rate(
      expectedVoiceSuccesses.length,
      expectedCompletions.length,
    ),
    medianTtsLatencyMs:
      successfulTts.length === 0
        ? null
        : percentile(
            successfulTts.map((result) => result.tts.latencyMs),
            0.5,
          ),
    actualCompletionCount: actualCompletions.length,
  };
}

function manualReviewTemplate(runId, results) {
  return {
    evaluationRunId: runId,
    reviewStatus: "not_reviewed",
    reviewer: null,
    reviewedAt: null,
    instructions:
      "Complete independently from generated scoring. Do not treat the grounding verifier as a human reviewer.",
    completedAnswers: results
      .filter((result) => result.actualDisposition === "completed")
      .map((result) => ({
        fixtureId: result.fixtureId,
        tutorRunId: result.tutorRunId,
        materialClaimsSupported: null,
        originalQuestionAnswered: null,
        citationsIdentifyRelevantPassages: null,
        unsupportedExternalFactsAbsent: null,
        secondarySchoolLanguageSuitable: null,
        analogiesClearlyIdentified: null,
        notes: null,
      })),
  };
}

function toCsv(results) {
  const headers = [
    "fixture_id",
    "category",
    "expected_disposition",
    "actual_disposition",
    "disposition_correct",
    "tutor_run_id",
    "retrieved_chunk_ids",
    "retrieved_topics",
    "retrieval_scores",
    "expected_source_hit",
    "expected_chunk_hit",
    "refusal_correct",
    "citation_structural",
    "grounding_verifier_grounded",
    "manual_author_review",
    "revision_count",
    "total_latency_ms",
    "asr_latency_ms",
    "tts_provider",
    "tts_api_version",
    "tts_model",
    "tts_voice_id",
    "tts_voice_name",
    "tts_format",
    "tts_input_characters",
    "tts_output_bytes",
    "tts_provider_character_cost",
    "tts_latency_ms",
    "tts_success",
    "tts_failure_code",
    "tts_estimated_cost",
    "tts_pricing_currency",
    "tts_pricing_version",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cost_status",
    "known_cost_subtotal_usd",
    "estimated_total",
    "safe_error_stage",
    "safe_error_code",
    "reinforcement_status",
  ];
  const rows = results.map((result) => [
    result.fixtureId,
    result.category,
    result.expectedDisposition,
    result.actualDisposition,
    result.dispositionCorrect,
    result.tutorRunId,
    result.retrievedChunkIds.join("|"),
    result.retrievedTopics.join("|"),
    result.retrievalScores
      .map((score) => `${score.chunkId}:${score.hybridScore}`)
      .join("|"),
    result.expectedSourceHit,
    result.expectedChunkHit,
    result.refusalResult.correct,
    result.citationIntegrity.structural,
    result.citationIntegrity.verifierJudgement,
    result.citationIntegrity.manualAuthorEvidenceReview,
    result.revisionCount,
    result.totalLatencyMs,
    result.asrLatencyMs,
    result.tts.provider,
    result.tts.apiVersion,
    result.tts.model,
    result.tts.voiceId,
    result.tts.voice,
    result.tts.format,
    result.tts.characterCount,
    result.tts.outputByteCount,
    result.tts.providerCharacterCost,
    result.tts.latencyMs,
    result.tts.synthesisSuccess,
    result.tts.failureCode,
    result.tts.estimatedCost,
    result.tts.pricingCurrency,
    result.tts.pricingVersion,
    result.tokenUsage.input,
    result.tokenUsage.output,
    result.tokenUsage.total,
    result.estimatedCost.status,
    result.estimatedCost.knownSubtotalUsd,
    result.estimatedCost.estimatedTotal,
    result.safeError?.stage,
    result.safeError?.code,
    result.reinforcementStatus,
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
    .concat("\n");
}

function toMarkdown(payload, manifest) {
  const a = payload.aggregates;
  const rows = payload.results
    .map(
      (result) =>
        `| ${result.fixtureId} | ${result.expectedDisposition} | ${
          result.actualDisposition
        } | ${result.expectedSourceHit ? "yes" : "no"} | ${
          result.citationIntegrity.structural === null
            ? "n/a"
            : result.citationIntegrity.structural
              ? "pass"
              : "fail"
        } | ${
          result.citationIntegrity.verifierJudgement
            ? "grounded"
            : "not grounded"
        } | ${result.totalLatencyMs} | ${
          result.tts.synthesisSuccess === null
            ? "not called"
            : result.tts.synthesisSuccess
              ? "success"
              : "failed"
        } | ${result.estimatedCost.status} |`,
    )
    .join("\n");
  return `# Chapter 4 evaluation summary

> **${payload.mode.toUpperCase()} MODE.** ${
    payload.mode === "mock"
      ? "These deterministic results validate fixtures, scoring, and exports. They are not live model or provider performance evidence."
      : "These results were produced against the locally configured live application."
  }

- Evaluation run: \`${payload.evaluationRunId}\`
- Timestamp: ${payload.generatedAt}
- Git commit: \`${manifest.git.commit}\` (dirty: ${manifest.git.dirty})
- Fixture version: ${payload.fixtureVersion}
- TTS: ${manifest.providers.tts.provider} ${manifest.providers.tts.apiVersion}, ${manifest.providers.tts.model}, ${manifest.providers.tts.voice}, ${manifest.providers.tts.format}
- Scope: system-level evaluation; no students; no learning-effectiveness claim

## Aggregate results

| Metric | Result |
|---|---:|
| Fixtures, including failures | ${a.fixtureCount} |
| Retrieval hit rate | ${formatRate(a.retrievalHitRate)} |
| Correct-refusal rate | ${formatRate(a.correctRefusalRate)} |
| Incorrect-refusal rate | ${formatRate(a.incorrectRefusalRate)} |
| Structural citation-integrity rate | ${formatRate(a.citationIntegrityRate)} |
| Grounding-verifier completion rate | ${formatRate(a.groundedCompletionRate)} |
| Revision rate | ${formatRate(a.revisionRate)} |
| Median / p95 latency | ${a.latencyMs.median} ms / ${a.latencyMs.p95} ms |
| Provider failures | ${a.providerFailureCount} |
| TTS provider | ${a.ttsProvider} |
| TTS-eligible fixtures | ${a.ttsEligibleFixtureCount} |
| External TTS calls made | ${a.externalTtsCallCount} |
| TTS synthesis success rate | ${formatRate(a.ttsSynthesisSuccessRate)} |
| End-to-end expected voice success | ${formatRate(
    a.endToEndVoiceSuccessRate,
  )} |
| Median TTS latency | ${a.medianTtsLatencyMs ?? "n/a"} ms |
| Known USD cost subtotal | $${a.cost.totalKnownSubtotalUsd.toFixed(6)} |
| Complete median estimated cost | ${
    a.cost.medianEstimated === null
      ? "unavailable"
      : `$${a.cost.medianEstimated.toFixed(6)}`
  } |
| Complete total estimated cost | ${
    a.cost.totalEstimated === null
      ? "unavailable"
      : `$${a.cost.totalEstimated.toFixed(6)}`
  } |
| Median known USD subtotal | $${a.cost.medianKnownSubtotalUsd.toFixed(6)} |

TTS cost uses the configured provider rate, currency, version, and effective date and is never an invoice. Provider \`character-cost\`, when present, is recorded separately as usage credits and is not treated as currency.

## Per-fixture results

| Fixture | Expected | Actual | Source hit | Structural citations | Verifier | Latency ms | TTS | Cost |
|---|---|---|---|---|---|---:|---|---|
${rows}

## Interpretation boundaries

Structural citation checks, the model grounding-verifier judgement, and manual author evidence review are separate. The accompanying \`manual-grounding-review.json\` is intentionally unfilled. This is system-level evaluation, not a student study, and it provides no evidence of learning effectiveness or student voice preference.
`;
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function formatRate(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function deterministicUuid(index) {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function nullableHeaderNumber(response, name) {
  const value = response.headers.get(name);
  return value === null || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}

function optionalNumber(value) {
  if (value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberEnv(name, fallback) {
  return optionalNumber(process.env[name]) ?? fallback;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
