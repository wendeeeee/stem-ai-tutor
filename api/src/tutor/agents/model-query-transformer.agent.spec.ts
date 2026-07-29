import { AgentContext } from '../contracts/agent.contract';
import { QueryTransformerProvider } from '../query-transformer/query-transformer-provider';
import { ModelQueryTransformerAgent } from './model-query-transformer.agent';

describe('ModelQueryTransformerAgent', () => {
  it('maps the provider transformation and usage into a structured agent result', async () => {
    const transform = jest.fn().mockResolvedValue({
      refinedQuery: 'kinetic energy definition formula examples',
      intent: 'learn_concept',
      concepts: ['kinetic energy'],
      corrections: [{ original: 'kinectic', corrected: 'kinetic' }],
      model: 'deterministic-test-model',
      inputTokens: 25,
      outputTokens: 18,
      estimatedCostUsd: 0.00001,
    });
    const provider: QueryTransformerProvider = { transform };
    const agent = new ModelQueryTransformerAgent(provider);
    const controller = new AbortController();
    const context = {
      runId: 'run-1',
      attempt: 0,
      deadlineAt: new Date(Date.now() + 1_000),
      signal: controller.signal,
      tools: {},
    } as AgentContext;

    const result = await agent.execute(
      { question: 'I want to learn about kinectic energy', language: 'en' },
      context,
    );

    expect(transform).toHaveBeenCalledWith(
      {
        question: 'I want to learn about kinectic energy',
        language: 'en',
      },
      controller.signal,
    );
    expect(result.output).toMatchObject({
      refinedQuery: 'kinetic energy definition formula examples',
      intent: 'learn_concept',
      corrections: [{ original: 'kinectic', corrected: 'kinetic' }],
    });
    expect(result.usage).toEqual({
      tokens: { input: 25, output: 18, total: 43 },
      estimatedCostUsd: 0.00001,
    });
    expect(result.summary).toMatchObject({ changed: true });
  });
});
