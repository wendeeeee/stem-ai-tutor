import { ConfigService } from '@nestjs/config';
import {
  ModelResponseClient,
  ModelResponseRequest,
  ModelResponseResult,
} from '../providers/model-response-client';
import { OpenAiReinforcementEvaluationProvider } from './openai-reinforcement-evaluation.provider';

class FakeClient implements ModelResponseClient {
  request: ModelResponseRequest | null = null;

  constructor(private readonly output: unknown) {}

  isConfigured(): boolean {
    return true;
  }

  create(request: ModelResponseRequest): Promise<ModelResponseResult> {
    this.request = request;
    return Promise.resolve({
      outputText: JSON.stringify(this.output),
      model: 'gpt-5.6-terra',
      status: 'completed',
      refused: false,
      inputTokens: 40,
      outputTokens: 10,
    });
  }
}

function config(): ConfigService {
  return {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;
}

describe('OpenAiReinforcementEvaluationProvider', () => {
  it('classifies equivalent student wording without generating feedback', async () => {
    const client = new FakeClient({
      correct: true,
      confidence: 'high',
      evaluationSummary: 'The central meaning is present.',
    });
    const provider = new OpenAiReinforcementEvaluationProvider(
      config(),
      client,
    );

    const result = await provider.evaluate(
      {
        question: 'What is energy?',
        expectedAnswer: 'Energy is the capacity to do work.',
        studentAnswer: 'It is the ability to perform work.',
      },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      correct: true,
      confidence: 'high',
      estimatedCostUsd: 0.00025,
    });
    expect(client.request?.instructions).toContain(
      'Accept accurate equivalent wording',
    );
    expect(client.request?.instructions).toContain(
      'Do not write feedback to the student',
    );
    expect(client.request?.input).toContain('<UNTRUSTED_STUDENT_ANSWER>');
  });

  it('fails closed on contradictory structured output', async () => {
    const provider = new OpenAiReinforcementEvaluationProvider(
      config(),
      new FakeClient({
        correct: 'yes',
        confidence: 'high',
        evaluationSummary: 'Invalid.',
      }),
    );

    await expect(
      provider.evaluate(
        {
          question: 'What is energy?',
          expectedAnswer: 'Energy is the capacity to do work.',
          studentAnswer: 'I do not know.',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('INVALID_REINFORCEMENT_EVALUATION');
  });
});
