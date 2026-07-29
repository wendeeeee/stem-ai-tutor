import { Inject, Injectable } from '@nestjs/common';
import {
  AgentContext,
  AgentResult,
  TutorAgent,
} from '../contracts/agent.contract';
import {
  isFiniteNonNegative,
  isGroundingOutput,
} from '../contracts/validation';
import {
  GroundingVerifierInput,
  GroundingVerifierOutput,
} from '../contracts/workflow.contracts';
import { GroundingVerifierProvider } from '../providers/grounding-verifier-provider';
import { HarnessError } from '../policies/harness-error';
import { GROUNDING_VERIFIER_PROVIDER } from '../tutor.constants';

@Injectable()
export class ModelGroundingVerifierAgent implements TutorAgent<
  GroundingVerifierInput,
  GroundingVerifierOutput
> {
  readonly name = 'grounding-verifier';

  constructor(
    @Inject(GROUNDING_VERIFIER_PROVIDER)
    private readonly provider: GroundingVerifierProvider,
  ) {}

  async execute(
    input: GroundingVerifierInput,
    context: AgentContext,
  ): Promise<AgentResult<GroundingVerifierOutput>> {
    const result = await this.provider.verify(
      { ...input, deadlineAt: context.deadlineAt },
      context.signal,
    );
    const output: GroundingVerifierOutput = {
      grounded: result.grounded,
      reasons: result.reasons,
      checkedCitationIds: result.checkedCitationIds,
      revisionRecommended: result.revisionRecommended,
      revisionGuidance: result.revisionGuidance,
      unsupportedClaims: result.unsupportedClaims,
    };
    if (
      !isGroundingOutput(output) ||
      !result.model.trim() ||
      !isFiniteNonNegative(result.inputTokens) ||
      !isFiniteNonNegative(result.outputTokens) ||
      !isFiniteNonNegative(result.estimatedCostUsd)
    ) {
      throw new HarnessError(
        'INVALID_GROUNDING_VERIFIER_OUTPUT',
        'The grounding verifier returned malformed or contradictory structured output.',
        'verification',
      );
    }

    return {
      output,
      usage: {
        tokens: {
          input: result.inputTokens,
          output: result.outputTokens,
          total: result.inputTokens + result.outputTokens,
        },
        estimatedCostUsd: result.estimatedCostUsd,
      },
      summary: {
        model: result.model,
        grounded: result.grounded,
        checkedCitationCount: result.checkedCitationIds.length,
        unsupportedClaimCount: result.unsupportedClaims.length,
        revisionRecommended: result.revisionRecommended,
        attempt: input.attempt,
      },
    };
  }
}
