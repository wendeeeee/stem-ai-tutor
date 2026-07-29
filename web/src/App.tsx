import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import { stripCitationMarkers } from "./citationMarkers";
import { normalizeLessonText } from "./lessonText";
import {
  generateReinforcement,
  getTutorRun,
  streamTutorRun,
  submitReinforcementAnswer,
  synthesizeSpeech,
  transcribeAudio,
} from "./api";
import { useRecorder } from "./recorder";
import {
  SpeechDownload,
  OutputLanguage,
  ReinforcementState,
  TraceEvent,
  TranscriptionResult,
  TutorRun,
} from "./types";

type UiStatus =
  | "idle"
  | "uploading"
  | "transcribing"
  | "ready"
  | "running"
  | "synthesizing"
  | "completed"
  | "refused"
  | "failed";

type ReinforcementStatus =
  | "idle"
  | "loading"
  | "ready"
  | "transcribing"
  | "evaluating"
  | "complete"
  | "error";

const maxRecordingMs =
  Number(import.meta.env.VITE_MAX_RECORDING_SECONDS ?? 30) * 1_000;

const stageOrder = [
  ["recording", "Record"],
  ["uploading", "Upload"],
  ["transcription", "Transcribe"],
  ["query-transformation", "Transform"],
  ["retrieval", "Retrieve"],
  ["tutor", "Tutor"],
  ["verification", "Verify"],
  ["translation", "Translate"],
  ["speech", "Synthesize"],
] as const;

const outputLanguages: ReadonlyArray<{
  code: OutputLanguage;
  label: string;
  short: string;
}> = [
  { code: "pcm", label: "Nigerian Pidgin", short: "PCM" },
  { code: "ig", label: "Igbo", short: "IG" },
  { code: "yo", label: "Yoruba", short: "YO" },
  { code: "ha", label: "Hausa", short: "HA" },
];

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `$${value.toFixed(6)}`;
}

function milliseconds(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : value >= 1_000
      ? `${(value / 1_000).toFixed(2)} s`
      : `${value} ms`;
}

function friendlyStage(stage: string): string {
  return (
    stageOrder.find(([key]) => key === stage)?.[1] ?? stage.replaceAll("-", " ")
  );
}

function isActive(status: UiStatus): boolean {
  return ["uploading", "transcribing", "running", "synthesizing"].includes(
    status,
  );
}

export function App() {
  const [transcript, setTranscript] = useState("");
  const [preferredLanguage, setPreferredLanguage] =
    useState<OutputLanguage>("pcm");
  const [reviewed, setReviewed] = useState(false);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [voiceSessionId, setVoiceSessionId] = useState<string | undefined>();
  const [asr, setAsr] = useState<TranscriptionResult | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [run, setRun] = useState<TutorRun | null>(null);
  const [speech, setSpeech] = useState<SpeechDownload | null>(null);
  const [speechUrl, setSpeechUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [reinforcement, setReinforcement] = useState<ReinforcementState | null>(
    null,
  );
  const [reinforcementAnswer, setReinforcementAnswer] = useState("");
  const [reinforcementReviewed, setReinforcementReviewed] = useState(false);
  const [reinforcementVoiceSessionId, setReinforcementVoiceSessionId] =
    useState<string | undefined>();
  const [reinforcementStatus, setReinforcementStatus] =
    useState<ReinforcementStatus>("idle");
  const [reinforcementError, setReinforcementError] = useState<string | null>(
    null,
  );
  const requestController = useRef<AbortController | null>(null);
  const reinforcementController = useRef<AbortController | null>(null);
  const recordingTarget = useRef<"question" | "reinforcement">("question");
  const runInFlight = useRef(false);

  useEffect(() => {
    if (!speech) {
      setSpeechUrl(null);
      return;
    }
    const url = URL.createObjectURL(speech.blob);
    setSpeechUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [speech]);

  useEffect(
    () => () => {
      requestController.current?.abort();
      reinforcementController.current?.abort();
    },
    [],
  );

  const handleRecording = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (recordingTarget.current === "reinforcement") {
        reinforcementController.current?.abort();
        setReinforcementError(null);
        setReinforcementReviewed(false);
        setReinforcementStatus("transcribing");
        const controller = new AbortController();
        reinforcementController.current = controller;
        try {
          const result = await transcribeAudio(
            blob,
            durationMs,
            controller.signal,
          );
          setReinforcementAnswer(result.transcript);
          setReinforcementVoiceSessionId(result.voiceSessionId);
          setReinforcementStatus("ready");
        } catch (reason: unknown) {
          if (controller.signal.aborted) return;
          setReinforcementStatus("error");
          setReinforcementError(
            reason instanceof Error
              ? reason.message
              : "Your answer could not be transcribed. Type it instead.",
          );
        } finally {
          if (reinforcementController.current === controller) {
            reinforcementController.current = null;
          }
        }
        return;
      }

      requestController.current?.abort();
      setError(null);
      setTtsError(null);
      setReviewed(false);
      setRun(null);
      setSpeech(null);
      setTrace([]);
      setStatus("uploading");
      const controller = new AbortController();
      requestController.current = controller;
      try {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        setStatus("transcribing");
        const result = await transcribeAudio(
          blob,
          durationMs,
          controller.signal,
        );
        setAsr(result);
        setVoiceSessionId(result.voiceSessionId);
        setTranscript(result.transcript);
        setStatus("ready");
      } catch (reason: unknown) {
        if (controller.signal.aborted) return;
        setStatus("failed");
        setError(
          reason instanceof Error
            ? reason.message
            : "Transcription failed. Type your question instead.",
        );
      } finally {
        if (requestController.current === controller) {
          requestController.current = null;
        }
      }
    },
    [],
  );

  const recorder = useRecorder({
    maxDurationMs: maxRecordingMs,
    disabled:
      isActive(status) ||
      reinforcementStatus === "transcribing" ||
      reinforcementStatus === "evaluating" ||
      reinforcementStatus === "loading",
    onRecording: handleRecording,
  });

  const prepareReinforcement = useCallback(
    async (runId: string, signal: AbortSignal) => {
      setReinforcementStatus("loading");
      setReinforcementError(null);
      try {
        const state = await generateReinforcement(runId, signal);
        setReinforcement(state);
        setReinforcementStatus(state.complete ? "complete" : "ready");
      } catch (reason: unknown) {
        if (signal.aborted) return;
        setReinforcementStatus("error");
        setReinforcementError(
          reason instanceof Error
            ? reason.message
            : "The quick learning check is temporarily unavailable.",
        );
      }
    },
    [],
  );

  const retryReinforcement = useCallback(async () => {
    if (!run?.runId || reinforcementStatus === "loading") return;
    reinforcementController.current?.abort();
    const controller = new AbortController();
    reinforcementController.current = controller;
    try {
      await prepareReinforcement(run.runId, controller.signal);
    } finally {
      if (reinforcementController.current === controller) {
        reinforcementController.current = null;
      }
    }
  }, [prepareReinforcement, reinforcementStatus, run?.runId]);

  const requestSpeech = useCallback(
    async (
      completedRun: TutorRun,
      signal: AbortSignal,
      prepareLearningCheck = true,
    ) => {
      setStatus("synthesizing");
      setTtsError(null);
      try {
        const download = await synthesizeSpeech(completedRun.runId, signal);
        setSpeech(download);
        const refreshed = await getTutorRun(completedRun.runId, signal);
        setRun(refreshed);
        setStatus("completed");
      } catch (reason: unknown) {
        if (signal.aborted) return;
        setTtsError(
          reason instanceof Error
            ? reason.message
            : "Speech synthesis failed. The written answer is still available.",
        );
        setStatus("completed");
      }
      if (!signal.aborted && prepareLearningCheck) {
        await prepareReinforcement(completedRun.runId, signal);
      }
    },
    [prepareReinforcement],
  );

  const retrySpeech = useCallback(async () => {
    if (!run || run.status !== "completed" || status === "synthesizing") return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    try {
      await requestSpeech(run, controller.signal, false);
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }, [requestSpeech, run, status]);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const question = transcript.trim();
      if (!question || !reviewed || isActive(status) || runInFlight.current) {
        return;
      }
      runInFlight.current = true;

      setError(null);
      setTtsError(null);
      setSpeech(null);
      setTrace([]);
      setRun(null);
      setReinforcement(null);
      setReinforcementAnswer("");
      setReinforcementReviewed(false);
      setReinforcementVoiceSessionId(undefined);
      setReinforcementStatus("idle");
      setReinforcementError(null);
      setStatus("running");
      const controller = new AbortController();
      requestController.current = controller;
      let activeRunId: string | null = null;
      let terminalRun: TutorRun | null = null;
      try {
        await streamTutorRun(
          {
            question,
            language: "en",
            preferredLanguage,
            ...(voiceSessionId ? { voiceSessionId } : {}),
          },
          async (eventData) => {
            setTrace((current) => [...current, eventData]);
            if (eventData.type === "run.created") {
              const candidate = eventData.summary.runId;
              if (typeof candidate === "string") activeRunId = candidate;
            }
            if (
              activeRunId &&
              (eventData.type === "retrieval.completed" ||
                eventData.type === "run.completed" ||
                eventData.type === "run.refused" ||
                eventData.type === "run.failed")
            ) {
              terminalRun = await getTutorRun(activeRunId, controller.signal);
              setRun(terminalRun);
            }
          },
          controller.signal,
        );

        if (activeRunId && !terminalRun) {
          terminalRun = await getTutorRun(activeRunId, controller.signal);
          setRun(terminalRun);
        }
        if (!terminalRun) {
          throw new Error("The tutor stream ended without a persisted run.");
        }
        if (terminalRun.status === "completed") {
          await requestSpeech(terminalRun, controller.signal);
        } else if (terminalRun.status === "refused") {
          setStatus("refused");
        } else {
          setStatus("failed");
          setError(
            terminalRun.refusal.reason ??
              terminalRun.errors[0]?.safeMessage ??
              "The tutor could not safely complete this request.",
          );
        }
      } catch (reason: unknown) {
        if (controller.signal.aborted) return;
        setStatus("failed");
        setError(
          reason instanceof Error
            ? reason.message
            : "The tutor request failed safely.",
        );
      } finally {
        runInFlight.current = false;
        if (requestController.current === controller) {
          requestController.current = null;
        }
      }
    },
    [
      preferredLanguage,
      requestSpeech,
      reviewed,
      status,
      transcript,
      voiceSessionId,
    ],
  );

  const submitLearningCheck = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const answer = reinforcementAnswer.trim();
      const questionId = reinforcement?.activeQuestionId;
      if (
        !run?.runId ||
        !questionId ||
        !answer ||
        !reinforcementReviewed ||
        reinforcementStatus === "evaluating"
      ) {
        return;
      }
      reinforcementController.current?.abort();
      const controller = new AbortController();
      reinforcementController.current = controller;
      setReinforcementStatus("evaluating");
      setReinforcementError(null);
      try {
        const state = await submitReinforcementAnswer(
          run.runId,
          {
            questionId,
            answer,
            ...(reinforcementVoiceSessionId
              ? { voiceSessionId: reinforcementVoiceSessionId }
              : {}),
          },
          controller.signal,
        );
        setReinforcement(state);
        setReinforcementAnswer("");
        setReinforcementReviewed(false);
        setReinforcementVoiceSessionId(undefined);
        setReinforcementStatus(state.complete ? "complete" : "ready");
      } catch (reason: unknown) {
        if (controller.signal.aborted) return;
        setReinforcementStatus("error");
        setReinforcementError(
          reason instanceof Error
            ? reason.message
            : "Your answer could not be checked safely.",
        );
      } finally {
        if (reinforcementController.current === controller) {
          reinforcementController.current = null;
        }
      }
    },
    [
      reinforcement,
      reinforcementAnswer,
      reinforcementReviewed,
      reinforcementStatus,
      reinforcementVoiceSessionId,
      run?.runId,
    ],
  );

  const currentReinforcementQuestion =
    reinforcement?.questions.find(
      (question) => question.id === reinforcement.activeQuestionId,
    ) ?? null;
  const reinforcementQuestions = reinforcement?.questions ?? [];
  const latestReinforcementAttempt =
    reinforcement?.questions.flatMap((question) => question.attempts).at(-1) ??
    null;

  const currentStage = useMemo(() => {
    if (recorder.status === "recording") return "recording";
    if (status === "uploading") return "uploading";
    if (status === "transcribing") return "transcription";
    if (status === "synthesizing") return "speech";
    const lastActive = [...trace]
      .reverse()
      .find((item) => item.status === "started" || item.status === "info");
    return lastActive?.stage ?? null;
  }, [recorder.status, status, trace]);

  const completedStages = useMemo(
    () =>
      new Set(
        trace
          .filter(
            (item) =>
              item.status === "completed" ||
              item.type === "retrieval.completed",
          )
          .map((item) => item.stage),
      ),
    [trace],
  );

  const tutorStageLatencies = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of run?.trace ?? trace) {
      if (item.type === "agent.completed" && item.latencyMs !== null) {
        totals.set(item.stage, (totals.get(item.stage) ?? 0) + item.latencyMs);
      }
    }
    return [...totals.entries()];
  }, [run, trace]);

  const asrCost =
    run?.voiceMetrics?.asr?.estimatedCostUsd ?? asr?.estimatedCostUsd;
  const ttsCost =
    run?.voiceMetrics?.tts?.estimatedCostUsd ?? speech?.estimatedCostUsd;
  const ttsCostUnavailable =
    (run?.voiceMetrics?.tts?.costStatus ?? speech?.costStatus) ===
    "unavailable";
  const totalCost =
    (asrCost ?? 0) + (run?.metrics.estimatedCostUsd ?? 0) + (ttsCost ?? 0);
  const totalLatency =
    (run?.voiceMetrics?.asr?.latencyMs ?? asr?.latencyMs ?? 0) +
    (run?.metrics.latencyMs ?? 0) +
    (run?.voiceMetrics?.tts?.latencyMs ?? speech?.latencyMs ?? 0);

  const transcriptHint =
    status === "ready"
      ? "Transcription complete. Correct any errors, then confirm your review."
      : "Type a question, or record one and review the transcript before submission.";

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">MULTILINGUAL NIGERIAN STEM TUTOR</p>
          <h1>Ask aloud. Inspect the evidence. Learn in your language.</h1>
          <p className="hero-copy">
            Every answer must clear curriculum retrieval and independent
            grounding checks. Unsupported questions are refused visibly.
          </p>
        </div>
        <div className="language-mode" aria-label="Selected answer language">
          <span aria-hidden="true">
            {outputLanguages.find((item) => item.code === preferredLanguage)
              ?.short ?? "PCM"}
          </span>
          <div>
            <strong>
              {
                outputLanguages.find((item) => item.code === preferredLanguage)
                  ?.label
              }
            </strong>
            <small>Gemini translation · 9jaLingo speech</small>
          </div>
        </div>
      </header>

      <section className="composer panel" aria-labelledby="ask-heading">
        <div className="section-heading">
          <div>
            <p className="step-label">01 · QUESTION</p>
            <h2 id="ask-heading">Record or type your STEM question</h2>
          </div>
          <span
            className={`status-pill status-${status}`}
            data-testid="ui-status"
          >
            {recorder.status === "recording" ? "recording" : status}
          </span>
        </div>

        <div className="record-row">
          <button
            type="button"
            className={`record-button ${recorder.status === "recording" ? "is-recording" : ""}`}
            onClick={() => {
              if (
                recorder.status === "recording" &&
                recordingTarget.current === "question"
              ) {
                recorder.stop();
              } else {
                recordingTarget.current = "question";
                void recorder.start();
              }
            }}
            disabled={
              isActive(status) ||
              (recorder.status === "recording" &&
                recordingTarget.current === "reinforcement")
            }
            aria-pressed={
              recorder.status === "recording" &&
              recordingTarget.current === "question"
            }
          >
            <span className="record-dot" aria-hidden="true" />
            {recorder.status === "recording" &&
            recordingTarget.current === "question"
              ? "Stop & transcribe"
              : "Start push-to-talk"}
          </button>
          <p>
            Maximum {maxRecordingMs / 1_000} seconds. Microphone access is
            requested only when you press the button.
          </p>
        </div>

        {(recorder.error || error) && (
          <div className="error-banner" role="alert">
            <strong>Something needs attention</strong>
            <span>{recorder.error ?? error}</span>
          </div>
        )}

        <form onSubmit={submit}>
          <label htmlFor="preferred-language">Answer language</label>
          <select
            id="preferred-language"
            value={preferredLanguage}
            onChange={(event) =>
              setPreferredLanguage(event.target.value as OutputLanguage)
            }
            disabled={isActive(status)}
          >
            {outputLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Retrieval and grounding use the English curriculum; Gemini
            translates only the verified answer.
          </p>
          <label htmlFor="transcript">Editable question transcript</label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setReviewed(false);
              if (!isActive(status)) setStatus("ready");
            }}
            placeholder="For example: What happens during a physical change in matter?"
            rows={4}
            disabled={isActive(status)}
            aria-describedby="transcript-hint"
          />
          <p id="transcript-hint" className="field-hint">
            {transcriptHint}
          </p>
          <div className="confirm-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
                disabled={!transcript.trim() || isActive(status)}
              />
              I reviewed this transcript and it asks the question I intend.
            </label>
            <button
              className="submit-button"
              type="submit"
              disabled={!transcript.trim() || !reviewed || isActive(status)}
            >
              {status === "running"
                ? "Tutor is working…"
                : status === "synthesizing"
                  ? "Creating speech…"
                  : "Run grounded tutor"}
            </button>
          </div>
        </form>
      </section>

      <section className="pipeline panel" aria-labelledby="pipeline-heading">
        <div className="section-heading">
          <div>
            <p className="step-label">02 · LIVE TRACE</p>
            <h2 id="pipeline-heading">Pipeline progress</h2>
          </div>
          {run?.runId && (
            <code className="run-id" title="Persisted run ID">
              Run {run.runId}
            </code>
          )}
        </div>
        <ol className="stage-list" aria-label="Tutor pipeline stages">
          {stageOrder.map(([key, label], index) => {
            const done =
              completedStages.has(key) ||
              (key === "transcription" && asr !== null) ||
              (key === "speech" && speech !== null);
            const active = currentStage === key && !done;
            return (
              <li
                key={key}
                className={done ? "done" : active ? "active" : ""}
                aria-current={active ? "step" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{label}</strong>
                <small>
                  {done ? "complete" : active ? "in progress" : "waiting"}
                </small>
              </li>
            );
          })}
        </ol>
        <div
          className="trace-feed"
          aria-live="polite"
          aria-label="Live trace events"
        >
          {trace.length === 0 ? (
            <p className="empty-copy">
              Confirm a transcript to watch genuine persisted events appear.
            </p>
          ) : (
            trace.map((item) => (
              <div className="trace-row" key={item.sequence}>
                <span>{String(item.sequence).padStart(2, "0")}</span>
                <div>
                  <strong>{friendlyStage(item.stage)}</strong>
                  <small>{item.type.replaceAll(".", " · ")}</small>
                </div>
                <em className={`trace-${item.status}`}>{item.status}</em>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="evidence panel" aria-labelledby="evidence-heading">
        <div className="section-heading">
          <div>
            <p className="step-label">03 · RETRIEVED EVIDENCE</p>
            <h2 id="evidence-heading">Curriculum chunks</h2>
          </div>
          <span className="count-badge">
            {run?.retrievedChunks.length ?? 0} accepted
          </span>
        </div>
        <div className="chunk-grid">
          {!run?.retrievedChunks.length ? (
            <p className="empty-copy">
              Accepted chunks appear here after retrieval. Below-threshold
              evidence never reaches the tutor.
            </p>
          ) : (
            run.retrievedChunks.map((chunk) => (
              <article className="chunk-card" key={chunk.chunkId}>
                <div className="chunk-meta">
                  <code>{chunk.chunkId}</code>
                  <span>{chunk.hybridScore.toFixed(4)} hybrid</span>
                </div>
                <h3>{chunk.topic.label ?? "Unmapped curriculum topic"}</h3>
                <p>{chunk.content}</p>
                <footer>
                  <strong>{chunk.document.sourceTitle}</strong>
                  <span>
                    {chunk.locator.sourceLocator} · {chunk.document.subject} ·{" "}
                    {chunk.document.schoolLevel}
                  </span>
                </footer>
              </article>
            ))
          )}
        </div>
      </section>

      <section
        className={`answer panel ${
          run?.status === "refused"
            ? "answer-refused"
            : run?.status === "completed"
              ? "answer-completed"
              : ""
        }`}
        aria-labelledby="answer-heading"
      >
        <div className="section-heading">
          <div>
            <p className="step-label">04 · GROUNDED RESPONSE</p>
            <h2 id="answer-heading">
              {run?.status === "refused"
                ? "Refused — evidence boundary held"
                : run?.status === "completed"
                  ? "Grounded answer"
                  : "Answer pending"}
            </h2>
          </div>
          {run?.grounding?.grounded && (
            <span className="grounded-badge">✓ independently verified</span>
          )}
        </div>

        {run?.status === "refused" ? (
          <div className="refusal-box" role="status">
            <strong>NO GROUNDED ANSWER GENERATED</strong>
            <p>
              {run.refusal.reason ??
                "The available curriculum evidence does not support this question."}
            </p>
            <small>
              Refusals remain text-only. The speech endpoint accepts only
              completed grounded runs.
            </small>
          </div>
        ) : run?.status === "completed" && run.translatedAnswer ? (
          <div className="answer-content">
            <div className="answer-text">
              <Markdown skipHtml>
                {stripCitationMarkers(
                  normalizeLessonText(run.translatedAnswer),
                  run.citations.map((citation) => citation.chunkId),
                )}
              </Markdown>
            </div>
            <p className="translation-note">
              Translated from the verified English answer into{" "}
              {
                outputLanguages.find((item) => item.code === run.outputLanguage)
                  ?.label
              }{" "}
              by {run.translation?.model ?? "Gemini"}.
            </p>
            {run.finalAnswer && (
              <details className="canonical-answer">
                <summary>View verified English source answer</summary>
                <Markdown skipHtml>
                  {stripCitationMarkers(
                    normalizeLessonText(run.finalAnswer),
                    run.citations.map((citation) => citation.chunkId),
                  )}
                </Markdown>
              </details>
            )}
            <div className="citation-list" aria-label="Canonical citations">
              {run.citations.map((citation, index) => (
                <span key={citation.chunkId}>
                  Source {index + 1}: {citation.sourceTitle},{" "}
                  {citation.sourceLocator}
                </span>
              ))}
            </div>
            <div className="speech-player">
              <div>
                <strong>AI-generated tutor voice.</strong>
                <small>This is a synthetic voice, not a human recording.</small>
                {(speech || run.voiceMetrics?.tts?.success) && (
                  <small>
                    Provider:{" "}
                    {(speech?.provider ?? run.voiceMetrics?.tts?.provider) ===
                    "naijalingo"
                      ? "9jaLingo"
                      : (speech?.provider ??
                            run.voiceMetrics?.tts?.provider) === "elevenlabs"
                        ? "ElevenLabs"
                        : (speech?.provider ??
                              run.voiceMetrics?.tts?.provider) === "yarngpt"
                          ? "YarnGPT"
                          : "OpenAI"}
                    {" · "}Voice:{" "}
                    {speech?.voice ?? run.voiceMetrics?.tts?.voice ?? "—"}
                    {" · "}Model:{" "}
                    {speech?.model ?? run.voiceMetrics?.tts?.model ?? "—"}
                    {" · "}Format:{" "}
                    {(
                      speech?.format ??
                      run.voiceMetrics?.tts?.format ??
                      "—"
                    ).toUpperCase()}
                    {" · "}TTS latency:{" "}
                    {milliseconds(
                      speech?.latencyMs ?? run.voiceMetrics?.tts?.latencyMs,
                    )}
                  </small>
                )}
              </div>
              {speechUrl ? (
                <audio controls preload="metadata" src={speechUrl}>
                  Your browser does not support audio playback.
                </audio>
              ) : status === "synthesizing" ? (
                <span className="speech-wait">Synthesizing…</span>
              ) : null}
            </div>
            {ttsError && (
              <div className="tts-warning" role="alert">
                <strong>Written answer preserved.</strong> {ttsError}
                <button
                  type="button"
                  className="submit-button"
                  onClick={() => void retrySpeech()}
                  disabled={status === "synthesizing"}
                >
                  Retry tutor voice
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="empty-copy">
            A final answer appears only after retrieval, citation enforcement,
            and independent grounding verification.
          </p>
        )}
      </section>

      <section
        className="reinforcement panel"
        aria-labelledby="reinforcement-heading"
      >
        <div className="section-heading">
          <div>
            <p className="step-label">05 · QUICK LEARNING CHECK</p>
            <h2 id="reinforcement-heading">Try it in your own words</h2>
          </div>
          {reinforcement && (
            <span className="count-badge">
              {reinforcement.questions.filter((question) => question.completed)
                .length ?? 0}
              /{reinforcement.questions.length} understood
            </span>
          )}
        </div>

        {run?.status !== "completed" ? (
          <p className="empty-copy">
            A short learning check appears only after a grounded explanation.
          </p>
        ) : reinforcementStatus === "loading" ? (
          <p className="empty-copy">
            Preparing a few questions from the explanation…
          </p>
        ) : reinforcement?.complete ? (
          <div className="reinforcement-complete" role="status">
            <strong>
              {reinforcement.questions.every((question) => question.completed)
                ? "Excellent work—you completed the learning check."
                : "Learning check complete."}
            </strong>
            <p>
              {reinforcement.questions.every((question) => question.completed)
                ? "You explained the key ideas in your own words."
                : "Revisit the explanation for any question that still needs practice."}
            </p>
          </div>
        ) : currentReinforcementQuestion ? (
          <div className="reinforcement-content">
            {latestReinforcementAttempt && (
              <div
                className={`reinforcement-feedback ${
                  latestReinforcementAttempt.correct
                    ? "feedback-correct"
                    : "feedback-hint"
                }`}
                role="status"
              >
                <strong>{latestReinforcementAttempt.feedback}</strong>
                {latestReinforcementAttempt.hint && (
                  <p>
                    <span>Hint:</span> {latestReinforcementAttempt.hint}
                  </p>
                )}
              </div>
            )}

            <div
              className="reinforcement-progress"
              aria-label="Question progress"
            >
              {reinforcementQuestions.map((question) => (
                <span
                  key={question.id}
                  className={
                    question.completed
                      ? "is-correct"
                      : question.exhausted
                        ? "is-exhausted"
                        : question.id === reinforcement?.activeQuestionId
                          ? "is-active"
                          : ""
                  }
                >
                  {question.position + 1}
                </span>
              ))}
            </div>

            <p className="reinforcement-question">
              <span>
                Question {currentReinforcementQuestion.position + 1} of{" "}
                {reinforcementQuestions.length}
              </span>
              {currentReinforcementQuestion.prompt}
            </p>
            <p className="field-hint">
              {currentReinforcementQuestion.attemptsRemaining} attempt
              {currentReinforcementQuestion.attemptsRemaining === 1
                ? ""
                : "s"}{" "}
              remaining. Answer in one or two sentences.
            </p>

            {reinforcementError && (
              <div className="error-banner" role="alert">
                <strong>Your answer is still here</strong>
                <span>{reinforcementError}</span>
              </div>
            )}

            <div className="record-row reinforcement-record">
              <button
                type="button"
                className={`record-button ${
                  recorder.status === "recording" &&
                  recordingTarget.current === "reinforcement"
                    ? "is-recording"
                    : ""
                }`}
                onClick={() => {
                  if (
                    recorder.status === "recording" &&
                    recordingTarget.current === "reinforcement"
                  ) {
                    recorder.stop();
                  } else {
                    recordingTarget.current = "reinforcement";
                    void recorder.start();
                  }
                }}
                disabled={
                  reinforcementStatus === "evaluating" ||
                  reinforcementStatus === "transcribing" ||
                  (recorder.status === "recording" &&
                    recordingTarget.current === "question")
                }
                aria-pressed={
                  recorder.status === "recording" &&
                  recordingTarget.current === "reinforcement"
                }
              >
                <span className="record-dot" aria-hidden="true" />
                {recorder.status === "recording" &&
                recordingTarget.current === "reinforcement"
                  ? "Stop & transcribe answer"
                  : "Record my answer"}
              </button>
              <p>You can record your answer or type it below.</p>
            </div>

            <form onSubmit={submitLearningCheck}>
              <label htmlFor="reinforcement-answer">Your answer</label>
              <textarea
                id="reinforcement-answer"
                value={reinforcementAnswer}
                onChange={(event) => {
                  setReinforcementAnswer(event.target.value);
                  setReinforcementReviewed(false);
                  if (reinforcementStatus === "error") {
                    setReinforcementStatus("ready");
                    setReinforcementError(null);
                  }
                }}
                placeholder="Explain the idea in your own words…"
                rows={3}
                disabled={
                  reinforcementStatus === "evaluating" ||
                  reinforcementStatus === "transcribing"
                }
              />
              <div className="confirm-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={reinforcementReviewed}
                    onChange={(event) =>
                      setReinforcementReviewed(event.target.checked)
                    }
                    disabled={
                      !reinforcementAnswer.trim() ||
                      reinforcementStatus === "evaluating" ||
                      reinforcementStatus === "transcribing"
                    }
                  />
                  I reviewed my answer and I am ready for feedback.
                </label>
                <button
                  className="submit-button"
                  type="submit"
                  disabled={
                    !reinforcementAnswer.trim() ||
                    !reinforcementReviewed ||
                    reinforcementStatus === "evaluating" ||
                    reinforcementStatus === "transcribing"
                  }
                >
                  {reinforcementStatus === "evaluating"
                    ? "Checking answer…"
                    : reinforcementStatus === "transcribing"
                      ? "Transcribing answer…"
                      : "Check my answer"}
                </button>
              </div>
            </form>
          </div>
        ) : reinforcementError ? (
          <div className="tts-warning" role="alert">
            <div>
              <strong>Learning check unavailable.</strong> {reinforcementError}
            </div>
            <button
              type="button"
              className="submit-button"
              onClick={() => void retryReinforcement()}
            >
              Try learning check again
            </button>
          </div>
        ) : (
          <p className="empty-copy">
            The learning check will appear when the grounded answer is ready.
          </p>
        )}
      </section>

      <footer className="metrics panel" aria-label="Run metrics">
        <div className="section-heading">
          <div>
            <p className="step-label">06 · REPRODUCIBLE METRICS</p>
            <h2>Latency, usage, and estimated cost</h2>
          </div>
          <span className={`final-status final-${run?.status ?? "pending"}`}>
            {run?.status ?? status}
          </span>
        </div>
        <dl className="metric-grid">
          <div>
            <dt>ASR latency</dt>
            <dd>
              {milliseconds(
                run?.voiceMetrics?.asr?.latencyMs ?? asr?.latencyMs,
              )}
            </dd>
          </div>
          {tutorStageLatencies.map(([stage, latency]) => (
            <div key={stage}>
              <dt>{friendlyStage(stage)}</dt>
              <dd>{milliseconds(latency)}</dd>
            </div>
          ))}
          <div>
            <dt>TTS latency</dt>
            <dd>
              {milliseconds(
                run?.voiceMetrics?.tts?.latencyMs ?? speech?.latencyMs,
              )}
            </dd>
          </div>
          <div>
            <dt>Total latency</dt>
            <dd>{totalLatency > 0 ? milliseconds(totalLatency) : "—"}</dd>
          </div>
          <div>
            <dt>Token usage</dt>
            <dd>{run?.metrics.tokens.total.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>Estimated cost</dt>
            <dd>
              {run
                ? ttsCostUnavailable
                  ? `TTS unavailable · known USD subtotal ${money(totalCost)}`
                  : money(totalCost)
                : "—"}
            </dd>
          </div>
          <div className="metric-run">
            <dt>Persisted run ID</dt>
            <dd>{run?.runId ?? "Created when the tutor starts"}</dd>
          </div>
        </dl>
        <p className="estimate-note">
          Cost values are configuration-based list-price estimates, not
          invoices. Provider character-cost values are usage credits, not
          currency. No input or generated audio is stored by this application.
        </p>
      </footer>

      <div className="sr-only" role="status" aria-live="polite">
        Current state: {recorder.status === "recording" ? "recording" : status}.
      </div>
    </main>
  );
}
