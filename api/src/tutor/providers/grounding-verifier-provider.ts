import { GroundingVerifierInput } from '../contracts/workflow.contracts';

export interface GroundingVerifierProviderInput extends GroundingVerifierInput {
  deadlineAt: Date;
}

export interface GroundingVerifierProviderResult {
  grounded: boolean;
  reasons: string[];
  checkedCitationIds: string[];
  revisionRecommended: boolean;
  revisionGuidance: string | null;
  unsupportedClaims: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface GroundingVerifierProvider {
  verify(
    input: GroundingVerifierProviderInput,
    signal: AbortSignal,
  ): Promise<GroundingVerifierProviderResult>;
}
