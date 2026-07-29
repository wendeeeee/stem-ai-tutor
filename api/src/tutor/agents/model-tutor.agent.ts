import { Inject, Injectable } from '@nestjs/common';
import {
  AgentContext,
  AgentResult,
  TutorAgent,
} from '../contracts/agent.contract';
import { isFiniteNonNegative, isTutorOutput } from '../contracts/validation';
import {
  TutorAgentInput,
  TutorAgentOutput,
} from '../contracts/workflow.contracts';
import { TutorProvider } from '../providers/tutor-provider';
import { HarnessError } from '../policies/harness-error';
import { TUTOR_PROVIDER } from '../tutor.constants';

@Injectable()
export class ModelTutorAgent implements TutorAgent<
  TutorAgentInput,
  TutorAgentOutput
> {
  readonly name = 'tutor';

  constructor(
    @Inject(TUTOR_PROVIDER) private readonly provider: TutorProvider,
  ) {}

  async execute(
    input: TutorAgentInput,
    context: AgentContext,
  ): Promise<AgentResult<TutorAgentOutput>> {
    const result = await this.provider.generate(
      { ...input, deadlineAt: context.deadlineAt },
      context.signal,
    );
    const chunks = new Map(input.chunks.map((chunk) => [chunk.chunkId, chunk]));
    const output: TutorAgentOutput = {
      answer: result.answer,
      citations: result.citedChunkIds.map((chunkId) => {
        const chunk = chunks.get(chunkId);
        return {
          chunkId,
          sourceTitle: chunk?.document.sourceTitle ?? '',
          sourceLocator: chunk?.locator.sourceLocator ?? '',
        };
      }),
      answerSummary: result.answerSummary,
      insufficientEvidence: result.insufficientEvidence,
      limitation: result.limitation,
    };
    if (
      !isTutorOutput(output) ||
      !result.model.trim() ||
      !isFiniteNonNegative(result.inputTokens) ||
      !isFiniteNonNegative(result.outputTokens) ||
      !isFiniteNonNegative(result.estimatedCostUsd)
    ) {
      throw new HarnessError(
        'INVALID_TUTOR_PROVIDER_OUTPUT',
        'The tutor returned malformed or contradictory structured output.',
        input.revision ? 'revision' : 'tutor',
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
        answerSummary: result.answerSummary,
        citationCount: result.citedChunkIds.length,
        insufficientEvidence: result.insufficientEvidence,
        limitation: result.limitation,
        revision: Boolean(input.revision),
      },
    };
  }
}
