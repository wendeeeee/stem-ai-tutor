import {
  SpeechDownload,
  OutputLanguage,
  ReinforcementState,
  TraceEvent,
  TranscriptionResult,
  TutorRun,
} from "./types";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? "";

function endpoint(path: string): string {
  return `${apiOrigin}${path}`;
}

async function safeError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
    };
    const message = Array.isArray(body.message)
      ? body.message.join(" ")
      : body.message;
    return new Error(message || fallback);
  } catch {
    return new Error(fallback);
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

export async function transcribeAudio(
  blob: Blob,
  durationMs: number,
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const form = new FormData();
  const mimeType = blob.type || "audio/webm";
  form.append("audio", blob, `question.${extensionFor(mimeType)}`);
  form.append("language", "en");
  form.append("durationMs", String(Math.max(1, Math.round(durationMs))));
  const response = await fetch(endpoint("/api/voice/transcriptions"), {
    method: "POST",
    body: form,
    signal,
  });
  if (!response.ok) {
    throw await safeError(response, "Transcription failed.");
  }
  return (await response.json()) as TranscriptionResult;
}

export async function getTutorRun(
  runId: string,
  signal?: AbortSignal,
): Promise<TutorRun> {
  const response = await fetch(endpoint(`/api/tutor/runs/${runId}`), {
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw await safeError(response, "Could not retrieve the tutor run.");
  }
  return (await response.json()) as TutorRun;
}

function parseEventBlock(
  block: string,
): { event: string; data: TraceEvent } | null {
  if (!block.trim() || block.startsWith(":")) return null;
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  return { event, data: JSON.parse(data.join("\n")) as TraceEvent };
}

export async function streamTutorRun(
  input: {
    question: string;
    language: "en";
    preferredLanguage: OutputLanguage;
    voiceSessionId?: string;
  },
  onEvent: (event: TraceEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(endpoint("/api/tutor/runs/stream"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) {
    throw await safeError(response, "The tutor stream could not start.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const blocks = pending.split(/\r?\n\r?\n/);
    pending = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseEventBlock(block);
      if (parsed) await onEvent(parsed.data);
    }
    if (done) break;
  }
  const final = parseEventBlock(pending);
  if (final) await onEvent(final.data);
}

export async function synthesizeSpeech(
  runId: string,
  signal?: AbortSignal,
): Promise<SpeechDownload> {
  const response = await fetch(endpoint(`/api/tutor/runs/${runId}/speech`), {
    method: "POST",
    signal,
  });
  if (!response.ok) {
    throw await safeError(response, "Speech synthesis failed.");
  }
  const numberHeader = (name: string): number | null => {
    const value = response.headers.get(name);
    return value === null || !Number.isFinite(Number(value))
      ? null
      : Number(value);
  };
  return {
    blob: await response.blob(),
    voiceSessionId: response.headers.get("x-voice-session-id"),
    model: response.headers.get("x-tts-model"),
    provider: response.headers.get("x-tts-provider") as
      "naijalingo" | "elevenlabs" | "openai" | "yarngpt" | null,
    apiVersion: response.headers.get("x-tts-api-version"),
    voice: response.headers.get("x-tts-voice"),
    voiceId: response.headers.get("x-tts-voice-id"),
    format: response.headers.get("x-tts-format"),
    latencyMs: numberHeader("x-tts-latency-ms"),
    estimatedCostUsd: numberHeader("x-tts-estimated-cost-usd"),
    estimatedCost: numberHeader("x-tts-estimated-cost"),
    costStatus: response.headers.get("x-tts-cost-status") as
      "estimated" | "unavailable" | null,
    pricingCurrency: response.headers.get("x-tts-pricing-currency"),
    pricingVersion: response.headers.get("x-tts-pricing-version"),
    pricingEffectiveDate: response.headers.get("x-tts-pricing-effective-date"),
    outputByteCount: numberHeader("x-tts-output-bytes"),
    characterCount: numberHeader("x-tts-input-characters"),
    chunkCount: numberHeader("x-tts-chunk-count"),
    providerCharacterCost: numberHeader("x-tts-provider-character-cost"),
    pricingRatePerThousandCharacters: numberHeader(
      "x-tts-pricing-rate-per-1000-characters",
    ),
  };
}

export async function generateReinforcement(
  runId: string,
  signal?: AbortSignal,
): Promise<ReinforcementState> {
  const response = await fetch(
    endpoint(`/api/tutor/runs/${runId}/reinforcement`),
    {
      method: "POST",
      signal,
    },
  );
  if (!response.ok) {
    throw await safeError(
      response,
      "Reinforcement questions could not be prepared.",
    );
  }
  return (await response.json()) as ReinforcementState;
}

export async function submitReinforcementAnswer(
  runId: string,
  input: {
    questionId: string;
    answer: string;
    voiceSessionId?: string;
  },
  signal?: AbortSignal,
): Promise<ReinforcementState> {
  const response = await fetch(
    endpoint(`/api/tutor/runs/${runId}/reinforcement/answers`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    },
  );
  if (!response.ok) {
    throw await safeError(
      response,
      "The reinforcement answer could not be evaluated.",
    );
  }
  return (await response.json()) as ReinforcementState;
}
