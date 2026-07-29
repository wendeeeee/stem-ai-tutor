import { Injectable } from '@nestjs/common';
import {
  AgentContext,
  AgentResult,
  TutorAgent,
} from '../contracts/agent.contract';
import {
  RetrievalAgentInput,
  RetrievalAgentOutput,
  CurriculumSearchOutput,
} from '../contracts/workflow.contracts';
import { HarnessPolicyService } from '../policies/harness-policy.service';
import { CURRICULUM_SEARCH_TOOL } from '../tutor.constants';

@Injectable()
export class DeterministicRetrievalAgent implements TutorAgent<
  RetrievalAgentInput,
  RetrievalAgentOutput
> {
  readonly name = 'retrieval';

  constructor(private readonly policies: HarnessPolicyService) {}

  async execute(
    input: RetrievalAgentInput,
    context: AgentContext,
  ): Promise<AgentResult<RetrievalAgentOutput>> {
    const result = await context.tools.invoke<
      {
        query: string;
        limit: number;
        threshold: number;
      },
      CurriculumSearchOutput
    >(CURRICULUM_SEARCH_TOOL, {
      query: input.query,
      limit: this.policies.values.retrievalLimit,
      threshold: this.policies.values.retrievalThreshold,
    });

    return {
      output: result.output,
      usage: {
        tokens: { input: 0, output: 0, total: 0 },
        estimatedCostUsd: 0,
      },
      summary: { retrievedChunkCount: result.output.chunks.length },
    };
  }
}
