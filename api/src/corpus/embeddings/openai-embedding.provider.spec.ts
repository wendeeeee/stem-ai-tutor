import { ConfigService } from '@nestjs/config';
import { OpenAiEmbeddingProvider } from './openai-embedding.provider';

describe('OpenAiEmbeddingProvider', () => {
  it('fails clearly when no API key is configured', async () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key === 'OPENAI_API_KEY' ? undefined : fallback,
      ),
    } as unknown as ConfigService;
    const provider = new OpenAiEmbeddingProvider(config);

    await expect(provider.embed(['science'])).rejects.toThrow(
      'OPENAI_API_KEY is required',
    );
  });

  it('rejects a dimension that does not match the database column', () => {
    const config = {
      get: jest.fn((key: string, fallback: unknown) =>
        key === 'EMBEDDING_DIMENSIONS' ? 256 : fallback,
      ),
    } as unknown as ConfigService;

    expect(() => new OpenAiEmbeddingProvider(config)).toThrow(
      'EMBEDDING_DIMENSIONS must be 1536',
    );
  });
});
