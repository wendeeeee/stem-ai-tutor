import {
  GroundingResult,
  QueryTransformation,
  StructuredRunError,
  TraceEvent,
  TraceEventStatus,
  TutorCitation,
  TutorRunMetrics,
  TutorRunState,
  TutorRunStatus,
  CurriculumChunk,
  ToolUsageMetric,
} from '../contracts/tutor-run-state';
import {
  OutputLanguage,
  TranslationMetadata,
} from '../translation/translation.contracts';

export interface CreateTutorRunRecord {
  question: string;
  language: string;
  outputLanguage: OutputLanguage;
  voiceSessionId?: string | null;
  metrics: TutorRunMetrics;
}

export interface TutorRunPatch {
  status?: TutorRunStatus;
  voiceSessionId?: string | null;
  queryTransformation?: QueryTransformation | null;
  retrievedChunks?: CurriculumChunk[];
  draftAnswer?: string | null;
  finalAnswer?: string | null;
  translatedAnswer?: string | null;
  translationMetadata?: TranslationMetadata | null;
  citations?: TutorCitation[];
  grounding?: GroundingResult | null;
  refused?: boolean;
  refusalReason?: string | null;
  metrics?: TutorRunMetrics;
  errors?: StructuredRunError[];
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface AppendTraceRecord {
  runId: string;
  sequence: number;
  type: string;
  stage: string;
  status: TraceEventStatus;
  agentName?: string | null;
  toolName?: string | null;
  summary?: Record<string, unknown>;
  latencyMs?: number | null;
  tokenCount?: number;
  estimatedCostUsd?: number;
  retryCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface StartToolRecord {
  runId: string;
  agentName: string;
  toolName: string;
  inputSummary: Record<string, unknown>;
  retryCount: number;
}

export interface FinishToolRecord {
  status: 'completed' | 'failed';
  durationMs: number;
  tokenCount: number;
  estimatedCostUsd: number;
  resultSummary: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: Date;
}

export interface TutorRunStore {
  createRun(
    input: CreateTutorRunRecord,
  ): Promise<{ id: string; createdAt: Date }>;
  updateRun(runId: string, patch: TutorRunPatch): Promise<void>;
  appendTrace(input: AppendTraceRecord): Promise<TraceEvent>;
  startTool(input: StartToolRecord): Promise<ToolUsageMetric>;
  finishTool(invocationId: string, patch: FinishToolRecord): Promise<void>;
  getRun(runId: string): Promise<TutorRunState | null>;
}
