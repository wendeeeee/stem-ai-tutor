import { Injectable } from '@nestjs/common';
import { AgentResult, TutorAgent } from '../contracts/agent.contract';
import {
  GroundingVerifierInput,
  GroundingVerifierOutput,
} from '../contracts/workflow.contracts';

@Injectable()
export class DeterministicGroundingVerifierAgent implements TutorAgent<
  GroundingVerifierInput,
  GroundingVerifierOutput
> {
  readonly name = 'grounding-verifier';

  execute(
    input: GroundingVerifierInput,
  ): Promise<AgentResult<GroundingVerifierOutput>> {
    const available = new Set(input.chunks.map((chunk) => chunk.chunkId));
    const citationIds = input.citations.map((citation) => citation.chunkId);
    const grounded =
      input.answer.trim().length > 0 &&
      citationIds.length > 0 &&
      citationIds.every((id) => available.has(id));
    const reasons = grounded
      ? []
      : ['The draft lacks valid curriculum evidence or citations.'];
    const inputTokens = Math.max(1, Math.ceil(input.answer.length / 4));

    return Promise.resolve({
      output: {
        grounded,
        reasons,
        checkedCitationIds: citationIds,
        revisionRecommended: !grounded && input.revisionAvailable,
        revisionGuidance:
          !grounded && input.revisionAvailable
            ? 'Remove unsupported claims and use only the supplied chunks.'
            : null,
        unsupportedClaims: grounded
          ? []
          : ['The draft lacks valid curriculum evidence or citations.'],
      },
      usage: {
        tokens: { input: inputTokens, output: 0, total: inputTokens },
        estimatedCostUsd: 0,
      },
      summary: {
        grounded,
        checkedCitationCount: citationIds.length,
      },
    });
  }
}
