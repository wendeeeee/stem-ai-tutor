export type TutorRunStatus =
  'created' | 'running' | 'completed' | 'refused' | 'failed';

export interface CurriculumChunk {
  chunkId: string;
  content: string;
  topic: {
    id: string | null;
    label: string | null;
  };
  locator: {
    pageStart: number;
    pageEnd: number;
    sourceLocator: string;
  };
  document: {
    id: string;
    sourceTitle: string;
    sourceAuthor: string | null;
    sourcePublisher: string | null;
    sourceUrl: string | null;
    sourceLicence: string;
    subject: string;
    schoolLevel: string;
    curriculum: string;
  };
  similarity: number;
  semanticSimilarity: number;
  lexicalSimilarity: number;
  hybridScore: number;
  matchedBy: Array<'semantic' | 'lexical'>;
  accepted: boolean;
}

export interface TutorCitation {
  chunkId: string;
  sourceTitle: string;
  sourceLocator: string;
}

export interface GroundingResult {
  grounded: boolean;
  reasons: string[];
  checkedCitationIds: string[];
  revisionRecommended: boolean;
  revisionGuidance: string | null;
  unsupportedClaims: string[];
}

export interface RefusalState {
  refused: boolean;
  reason: string | null;
}

export interface QueryTransformation {
  originalQuery: string;
  refinedQuery: string;
  intent:
    | 'learn_concept'
    | 'define_concept'
    | 'solve_problem'
    | 'compare_concepts'
    | 'explain_process'
    | 'other';
  concepts: string[];
  corrections: Array<{ original: string; corrected: string }>;
  model: string;
}

export interface TokenMetrics {
  input: number;
  output: number;
  total: number;
}

export interface TutorRunMetrics {
  tokens: TokenMetrics;
  estimatedCostUsd: number;
  latencyMs: number;
  agentCalls: number;
  toolCalls: number;
  retries: number;
  revisions: number;
}

export type TraceEventStatus = 'started' | 'completed' | 'failed' | 'info';

export interface TraceEvent {
  id?: string;
  sequence: number;
  type: string;
  stage: string;
  status: TraceEventStatus;
  agentName: string | null;
  toolName: string | null;
  summary: Record<string, unknown>;
  latencyMs: number | null;
  tokenCount: number;
  estimatedCostUsd: number;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface StructuredRunError {
  code: string;
  stage: string;
  safeMessage: string;
  retryable: boolean;
  occurredAt: Date;
}

export interface ToolUsageMetric {
  invocationId: string;
  agentName: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  durationMs: number | null;
  tokenCount: number;
  estimatedCostUsd: number;
  retryCount: number;
  resultSummary: Record<string, unknown> | null;
  errorCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TutorRunState {
  runId: string;
  voiceSessionId: string | null;
  status: TutorRunStatus;
  question: string;
  language: string;
  outputLanguage: import('../translation/translation.contracts').OutputLanguage;
  queryTransformation: QueryTransformation | null;
  retrievedChunks: CurriculumChunk[];
  draftAnswer: string | null;
  finalAnswer: string | null;
  translatedAnswer: string | null;
  translation:
    import('../translation/translation.contracts').TranslationMetadata | null;
  citations: TutorCitation[];
  grounding: GroundingResult | null;
  refusal: RefusalState;
  metrics: TutorRunMetrics;
  voiceMetrics:
    import('../../voice/contracts/voice.contracts').VoiceMetrics | null;
  toolUsage: ToolUsageMetric[];
  trace: TraceEvent[];
  errors: StructuredRunError[];
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface TutorRunProgressOptions {
  observer?: (event: TraceEvent) => void | Promise<void>;
  signal?: AbortSignal;
}
