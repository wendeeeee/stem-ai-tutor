import { AgentContext } from '../contracts/agent.contract';
import { ModelGroundingVerifierAgent } from './model-grounding-verifier.agent';

describe('ModelGroundingVerifierAgent', () => {
  it('maps independent verifier conclusions and usage at the agent boundary', async () => {
    const verify = jest.fn().mockResolvedValue({
      grounded: false,
      reasons: ['One claim is unsupported.'],
      checkedCitationIds: ['chunk-1'],
      revisionRecommended: true,
      revisionGuidance: 'Remove the unsupported claim.',
      unsupportedClaims: ['Unsupported claim.'],
      model: 'verifier-model',
      inputTokens: 40,
      outputTokens: 15,
      estimatedCostUsd: 0.0003,
    });
    const agent = new ModelGroundingVerifierAgent({
      verify,
    });
    const controller = new AbortController();
    const deadlineAt = new Date(Date.now() + 1_000);
    const input = {
      question: 'Question?',
      answer: 'Draft.',
      citations: [
        { chunkId: 'chunk-1', sourceTitle: 'Text', sourceLocator: 'page 1' },
      ],
      chunks: [],
      attempt: 'initial' as const,
      revisionAvailable: true,
    };

    const result = await agent.execute(input, {
      runId: 'run-1',
      attempt: 0,
      deadlineAt,
      signal: controller.signal,
      tools: {},
    } as AgentContext);

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineAt, attempt: 'initial' }),
      controller.signal,
    );
    expect(result.output).toMatchObject({
      grounded: false,
      revisionGuidance: 'Remove the unsupported claim.',
    });
    expect(result.usage.tokens.total).toBe(55);
  });
});
