import { Inject, Injectable } from '@nestjs/common';
import {
  AgentContext,
  AgentResult,
  TutorAgent,
} from '../contracts/agent.contract';
import {
  QueryTransformerAgentInput,
  QueryTransformerAgentOutput,
} from '../contracts/workflow.contracts';
import { QueryTransformerProvider } from '../query-transformer/query-transformer-provider';
import { QUERY_TRANSFORMER_PROVIDER } from '../tutor.constants';

@Injectable()
export class ModelQueryTransformerAgent implements TutorAgent<
  QueryTransformerAgentInput,
  QueryTransformerAgentOutput
> {
  readonly name = 'query-transformer';

  constructor(
    @Inject(QUERY_TRANSFORMER_PROVIDER)
    private readonly provider: QueryTransformerProvider,
  ) {}

  async execute(
    input: QueryTransformerAgentInput,
    context: AgentContext,
  ): Promise<AgentResult<QueryTransformerAgentOutput>> {
    const result = await this.provider.transform(input, context.signal);

    return {
      output: {
        refinedQuery: result.refinedQuery,
        intent: result.intent,
        concepts: result.concepts,
        corrections: result.corrections,
        model: result.model,
      },
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
        intent: result.intent,
        conceptCount: result.concepts.length,
        correctionCount: result.corrections.length,
        changed:
          result.refinedQuery.trim().toLocaleLowerCase() !==
          input.question.trim().toLocaleLowerCase(),
      },
    };
  }
}
