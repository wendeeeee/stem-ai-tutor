import { ConfigService } from '@nestjs/config';
import {
  ModelResponseClient,
  ModelResponseRequest,
  ModelResponseResult,
} from '../providers/model-response-client';
import { OpenAiReinforcementQuestionProvider } from './openai-reinforcement-question.provider';
import { ReinforcementQuestionProviderInput } from './reinforcement.contracts';

class FakeClient implements ModelResponseClient {
  request: ModelResponseRequest | null = null;

  constructor(
    private readonly result: ModelResponseResult,
    private readonly configured = true,
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  create(request: ModelResponseRequest): Promise<ModelResponseResult> {
    this.request = request;
    return Promise.resolve(this.result);
  }
}

function config(): ConfigService {
  return {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  } as unknown as ConfigService;
}

function response(output: unknown): ModelResponseResult {
  return {
    outputText: JSON.stringify(output),
    model: 'gpt-5.6-terra',
    status: 'completed',
    refused: false,
    inputTokens: 100,
    outputTokens: 20,
  };
}

const input: ReinforcementQuestionProviderInput = {
  originalQuestion: 'What is energy?',
  finalAnswer: 'Energy is the capacity to do work.',
  citations: [
    {
      chunkId: 'chunk-1',
      sourceTitle: 'Science',
      sourceLocator: 'page 1',
    },
  ],
  chunks: [
    {
      chunkId: 'chunk-1',
      content: 'Energy is the capacity to do work.',
      topic: { id: null, label: 'Energy' },
      locator: { pageStart: 1, pageEnd: 1, sourceLocator: 'page 1' },
      document: {
        id: 'document-1',
        sourceTitle: 'Science',
        sourceAuthor: null,
        sourcePublisher: null,
        sourceUrl: null,
        sourceLicence: 'Test',
        subject: 'Science',
        schoolLevel: 'SS1',
        curriculum: 'NERDC',
      },
      similarity: 1,
      semanticSimilarity: 1,
      lexicalSimilarity: 1,
      hybridScore: 1,
      matchedBy: ['semantic', 'lexical'],
      accepted: true,
    },
  ],
  questionCount: 1,
};

describe('OpenAiReinforcementQuestionProvider', () => {
  it('generates strict evidence-linked questions and maps usage', async () => {
    const client = new FakeClient(
      response({
        questions: [
          {
            prompt: 'What is energy?',
            answerUnitId: 'answer-unit-1',
            hint: 'Think about what a system can do.',
            evidenceChunkIds: ['chunk-1'],
          },
        ],
      }),
    );
    const provider = new OpenAiReinforcementQuestionProvider(config(), client);

    const result = await provider.generate(input, new AbortController().signal);

    expect(result).toMatchObject({
      model: 'gpt-5.6-terra',
      inputTokens: 100,
      outputTokens: 20,
      estimatedCostUsd: 0.00055,
      items: [
        {
          expectedAnswer: 'Energy is the capacity to do work.',
          evidenceChunkIds: ['chunk-1'],
        },
      ],
    });
    expect(client.request?.instructions).toContain(
      'Never write or paraphrase the expected answer yourself',
    );
    expect(client.request?.input).toContain(
      '<UNTRUSTED_SELECTABLE_ANSWER_UNITS>',
    );
    expect(client.request?.schema).toMatchObject({
      properties: {
        questions: { minItems: 1, maxItems: 1 },
      },
    });
  });

  it('fails closed on malformed output and missing configuration', async () => {
    const malformed = new OpenAiReinforcementQuestionProvider(
      config(),
      new FakeClient(response({ questions: [] })),
    );
    await expect(
      malformed.generate(input, new AbortController().signal),
    ).rejects.toThrow('INVALID_REINFORCEMENT_OUTPUT');

    const unknownAnswerUnit = new OpenAiReinforcementQuestionProvider(
      config(),
      new FakeClient(
        response({
          questions: [
            {
              prompt: 'What is energy?',
              answerUnitId: 'answer-unit-999',
              hint: 'Think about what a system can do.',
              evidenceChunkIds: ['chunk-1'],
            },
          ],
        }),
      ),
    );
    await expect(
      unknownAnswerUnit.generate(input, new AbortController().signal),
    ).rejects.toThrow('INVALID_REINFORCEMENT_OUTPUT');

    const missing = new OpenAiReinforcementQuestionProvider(
      config(),
      new FakeClient(response({}), false),
    );
    await expect(
      missing.generate(input, new AbortController().signal),
    ).rejects.toThrow('REINFORCEMENT_NOT_CONFIGURED');
  });
});
