import { ConfigService } from '@nestjs/config';
import { HarnessError } from '../policies/harness-error';
import { OpenAiQueryTransformerProvider } from './openai-query-transformer.provider';

describe('OpenAiQueryTransformerProvider', () => {
  it('fails safely without making a request when the API key is absent', async () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key === 'OPENAI_API_KEY' ? undefined : fallback,
      ),
    } as unknown as ConfigService;
    const provider = new OpenAiQueryTransformerProvider(config);

    await expect(
      provider.transform(
        { question: 'What is kinetic energy?', language: 'en' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject<Partial<HarnessError>>({
      code: 'QUERY_TRANSFORMER_NOT_CONFIGURED',
      safeMessage: 'The query transformer is not configured.',
      retryable: false,
    });
  });
});
