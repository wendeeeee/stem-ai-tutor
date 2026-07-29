import { QueryCorrection, QueryIntent } from '../contracts/workflow.contracts';

export interface QueryTransformerProviderInput {
  question: string;
  language: string;
}

export interface QueryTransformerProviderResult {
  refinedQuery: string;
  intent: QueryIntent;
  concepts: string[];
  corrections: QueryCorrection[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface QueryTransformerProvider {
  transform(
    input: QueryTransformerProviderInput,
    signal: AbortSignal,
  ): Promise<QueryTransformerProviderResult>;
}
