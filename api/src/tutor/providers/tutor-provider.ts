import { QueryTransformation } from '../contracts/tutor-run-state';
import { TutorAgentInput } from '../contracts/workflow.contracts';

export interface TutorProviderInput {
  question: string;
  language: string;
  queryTransformation: QueryTransformation;
  chunks: TutorAgentInput['chunks'];
  revision?: TutorAgentInput['revision'];
  deadlineAt: Date;
}

export interface TutorProviderResult {
  answer: string;
  citedChunkIds: string[];
  answerSummary: string;
  insufficientEvidence: boolean;
  limitation: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface TutorProvider {
  generate(
    input: TutorProviderInput,
    signal: AbortSignal,
  ): Promise<TutorProviderResult>;
}
