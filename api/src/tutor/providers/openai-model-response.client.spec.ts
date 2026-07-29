import { ConfigService } from '@nestjs/config';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
interface CapturedRequest {
  model: string;
  store: boolean;
  reasoning: { effort: string };
  max_output_tokens: number;
  text: {
    format: { type: string; strict: boolean; name: string };
  };
}

const mockCreate =
  jest.fn<
    (
      request: CapturedRequest,
      options: { signal: AbortSignal },
    ) => Promise<unknown>
  >();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: mockCreate },
  })),
}));

import { OpenAiModelResponseClient } from './openai-model-response.client';

describe('OpenAiModelResponseClient', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('uses non-stored strict Responses output and forwards the abort signal', async () => {
    mockCreate.mockResolvedValue({
      output_text: '{"answer":"ok"}',
      model: 'gpt-5.6-terra',
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"answer":"ok"}' }],
        },
      ],
      usage: { input_tokens: 11, output_tokens: 7 },
    });
    const config = {
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'test-api-key' : undefined,
      ),
    } as unknown as ConfigService;
    const client = new OpenAiModelResponseClient(config);
    const controller = new AbortController();

    const result = await client.create(
      {
        model: 'gpt-5.6-terra',
        instructions: 'Trusted instructions.',
        input: 'Untrusted input.',
        maxOutputTokens: 500,
        schemaName: 'test_schema',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      },
      controller.signal,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const sent = mockCreate.mock.calls[0]?.[0] as CapturedRequest | undefined;
    expect(sent).toBeDefined();
    if (!sent) throw new Error('Expected a captured request.');
    expect(sent).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 500,
    });
    expect(sent.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
      name: 'test_schema',
    });
    expect(mockCreate.mock.calls[0]?.[1]).toEqual({
      signal: controller.signal,
    });
    expect(result).toMatchObject({
      outputText: '{"answer":"ok"}',
      refused: false,
      inputTokens: 11,
      outputTokens: 7,
    });
  });
});
