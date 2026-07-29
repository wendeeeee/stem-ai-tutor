import { CurriculumChunk, TutorCitation } from '../contracts/tutor-run-state';

export interface ReinforcementItemDraft {
  prompt: string;
  expectedAnswer: string;
  hint: string;
  evidenceChunkIds: string[];
}

export interface ReinforcementItem extends ReinforcementItemDraft {
  id: string;
  position: number;
}

export interface ReinforcementUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface ReinforcementGenerationResult extends ReinforcementUsage {
  items: ReinforcementItemDraft[];
  model: string;
}

export interface ReinforcementEvaluationResult extends ReinforcementUsage {
  correct: boolean;
  confidence: 'high' | 'medium' | 'low';
  evaluationSummary: string;
  model: string;
}

export interface ReinforcementQuestionProviderInput {
  originalQuestion: string;
  finalAnswer: string;
  citations: TutorCitation[];
  chunks: CurriculumChunk[];
  questionCount: number;
}

export interface ReinforcementEvaluationProviderInput {
  question: string;
  expectedAnswer: string;
  studentAnswer: string;
}

export interface ReinforcementQuestionProvider {
  generate(
    input: ReinforcementQuestionProviderInput,
    signal: AbortSignal,
  ): Promise<ReinforcementGenerationResult>;
}

export interface ReinforcementEvaluationProvider {
  evaluate(
    input: ReinforcementEvaluationProviderInput,
    signal: AbortSignal,
  ): Promise<ReinforcementEvaluationResult>;
}

export interface ReinforcementAttemptView {
  id: string;
  questionId: string;
  attemptNumber: number;
  studentAnswer: string;
  correct: boolean;
  feedback: string;
  hint: string | null;
  createdAt: Date;
}

export interface ReinforcementQuestionView {
  id: string;
  position: number;
  prompt: string;
  completed: boolean;
  exhausted: boolean;
  attemptsRemaining: number;
  attempts: ReinforcementAttemptView[];
}

export interface ReinforcementState {
  runId: string;
  questions: ReinforcementQuestionView[];
  activeQuestionId: string | null;
  complete: boolean;
  generation: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}
