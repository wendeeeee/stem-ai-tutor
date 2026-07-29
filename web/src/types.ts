export interface TraceEvent {
  sequence: number;
  type: string;
  stage: string;
  status: "started" | "completed" | "failed" | "info";
  summary: Record<string, unknown>;
  latencyMs: number | null;
  tokenCount: number;
  estimatedCostUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface CurriculumChunk {
  chunkId: string;
  content: string;
  topic: { id: string | null; label: string | null };
  locator: {
    pageStart: number;
    pageEnd: number;
    sourceLocator: string;
  };
  document: {
    sourceTitle: string;
    subject: string;
    schoolLevel: string;
    curriculum: string;
  };
  hybridScore: number;
}

export interface VoiceStageMetrics {
  model: string;
  latencyMs: number;
  estimatedCostUsd: number | null;
}

export interface VoiceMetrics {
  voiceSessionId: string;
  asr:
    | (VoiceStageMetrics & {
        durationMs: number;
        mimeType: string;
      })
    | null;
  tts:
    | (VoiceStageMetrics & {
        provider: "naijalingo" | "elevenlabs" | "openai" | "yarngpt";
        apiVersion: string;
        voice: string;
        voiceId: string | null;
        format: string;
        characterCount: number;
        chunkCount: number;
        chunks: Array<{
          index: number;
          characterCount: number;
          latencyMs: number;
          retryCount: number;
          outputByteCount: number;
          success: boolean;
          failureCode: string | null;
          cached: boolean;
        }>;
        failedChunkIndex: number | null;
        totalSynthesisLatencyMs: number;
        outputByteCount: number;
        providerCharacterCost: number | null;
        success: boolean;
        failureCode: string | null;
        costStatus: "estimated" | "unavailable";
        estimatedCost: number | null;
        pricingCurrency: string;
        pricingVersion: string;
        pricingEffectiveDate: string | null;
        pricingRatePerThousandCharacters: number | null;
      })
    | null;
}

export type OutputLanguage = "pcm" | "ig" | "yo" | "ha";

export interface TutorRun {
  runId: string;
  voiceSessionId: string | null;
  status: "created" | "running" | "completed" | "refused" | "failed";
  question: string;
  language: string;
  outputLanguage: OutputLanguage;
  retrievedChunks: CurriculumChunk[];
  finalAnswer: string | null;
  translatedAnswer: string | null;
  translation: {
    provider: "gemini";
    model: string;
    sourceLanguage: "en";
    targetLanguage: OutputLanguage;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    inputCharacters: number;
    outputCharacters: number;
    latencyMs: number;
  } | null;
  citations: Array<{
    chunkId: string;
    sourceTitle: string;
    sourceLocator: string;
  }>;
  grounding: { grounded: boolean } | null;
  refusal: { refused: boolean; reason: string | null };
  metrics: {
    tokens: { input: number; output: number; total: number };
    estimatedCostUsd: number;
    latencyMs: number;
    agentCalls: number;
    toolCalls: number;
    retries: number;
    revisions: number;
  };
  voiceMetrics: VoiceMetrics | null;
  trace: TraceEvent[];
  errors: Array<{ code: string; safeMessage: string; stage: string }>;
}

export interface TranscriptionResult {
  transcript: string;
  language: string;
  model: string;
  latencyMs: number;
  estimatedCostUsd: number;
  voiceSessionId: string;
}

export interface SpeechDownload {
  blob: Blob;
  voiceSessionId: string | null;
  model: string | null;
  provider: "naijalingo" | "elevenlabs" | "openai" | "yarngpt" | null;
  apiVersion: string | null;
  voice: string | null;
  voiceId: string | null;
  format: string | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  estimatedCost: number | null;
  costStatus: "estimated" | "unavailable" | null;
  pricingCurrency: string | null;
  pricingVersion: string | null;
  pricingEffectiveDate: string | null;
  outputByteCount: number | null;
  characterCount: number | null;
  chunkCount: number | null;
  providerCharacterCost: number | null;
  pricingRatePerThousandCharacters: number | null;
}

export interface ReinforcementAttempt {
  id: string;
  questionId: string;
  attemptNumber: number;
  studentAnswer: string;
  correct: boolean;
  feedback: string;
  hint: string | null;
  createdAt: string;
}

export interface ReinforcementQuestion {
  id: string;
  position: number;
  prompt: string;
  completed: boolean;
  exhausted: boolean;
  attemptsRemaining: number;
  attempts: ReinforcementAttempt[];
}

export interface ReinforcementState {
  runId: string;
  questions: ReinforcementQuestion[];
  activeQuestionId: string | null;
  complete: boolean;
  generation: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}
