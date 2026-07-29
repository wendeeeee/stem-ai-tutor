import { ConfigService } from '@nestjs/config';
import { GeminiTranslationProvider } from './gemini-translation.provider';

interface GenerateContentRequest {
  model: string;
  contents: string;
  config: {
    temperature?: number;
    responseMimeType?: string;
    responseJsonSchema?: unknown;
  };
}

interface GenerateContentResponse {
  text: string;
  modelVersion?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

const mockGenerateContent = jest.fn<
  Promise<GenerateContentResponse>,
  [GenerateContentRequest]
>();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

describe('GeminiTranslationProvider', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('uses the supplied translation requirements and schema-valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        translatedText: 'Agbara ni agbara lati se ise.',
      }),
      modelVersion: 'gemini-2.5-flash-test',
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 },
    });
    const provider = new GeminiTranslationProvider(
      new ConfigService({
        GEMINI_API_Key: 'test-key',
        GEMINI_TRANSLATION_MODEL: 'gemini-3.5-flash-lite',
        GEMINI_TRANSLATION_INPUT_COST_PER_MILLION_TOKENS_USD: 1,
        GEMINI_TRANSLATION_OUTPUT_COST_PER_MILLION_TOKENS_USD: 2,
      }),
    );

    const result = await provider.translate({
      text: 'Energy is the capacity to do work.',
      targetLanguage: 'yo',
    });

    const request = mockGenerateContent.mock.calls[0]?.[0];
    expect(request?.model).toBe('gemini-3.5-flash-lite');
    expect(request?.contents).toContain(
      'Preserve the original scientific meaning exactly.',
    );
    expect(request?.contents).toContain('Use correct Yoruba diacritics.');
    expect(request?.config.temperature).toBe(0);
    expect(request?.config.responseMimeType).toBe('application/json');
    expect(request?.config.responseJsonSchema).toBeDefined();
    expect(result).toEqual({
      translatedText: 'Agbara ni agbara lati se ise.',
      provider: 'gemini',
      model: 'gemini-2.5-flash-test',
      sourceLanguage: 'en',
      targetLanguage: 'yo',
      inputTokens: 20,
      outputTokens: 10,
      estimatedCostUsd: 0.00004,
    });
  });

  it('fails closed when configuration or structured output is invalid', async () => {
    const missing = new GeminiTranslationProvider(
      new ConfigService({ GEMINI_API_Key: '' }),
    );
    await expect(
      missing.translate({ text: 'Lesson', targetLanguage: 'ig' }),
    ).rejects.toMatchObject({ code: 'TRANSLATION_NOT_CONFIGURED' });

    mockGenerateContent.mockResolvedValue({ text: 'not json' });
    const configured = new GeminiTranslationProvider(
      new ConfigService({
        GEMINI_API_Key: 'test-key',
        GEMINI_TRANSLATION_MODEL: 'gemini-3.5-flash-lite',
      }),
    );
    await expect(
      configured.translate({ text: 'Lesson', targetLanguage: 'ha' }),
    ).rejects.toMatchObject({ code: 'TRANSLATION_INVALID_RESPONSE' });
  });

  it.each([
    [403, 'TRANSLATION_AUTH_FAILED', false],
    [404, 'TRANSLATION_MODEL_UNAVAILABLE', false],
    [429, 'TRANSLATION_QUOTA_EXCEEDED', true],
    [503, 'TRANSLATION_PROVIDER_UNAVAILABLE', true],
  ])(
    'maps provider status %s to a safe actionable failure',
    async (status, code, retryable) => {
      mockGenerateContent.mockRejectedValue(
        Object.assign(new Error('raw provider response'), { status }),
      );
      const provider = new GeminiTranslationProvider(
        new ConfigService({
          GEMINI_API_Key: 'test-key',
          GEMINI_TRANSLATION_MODEL: 'gemini-3.5-flash-lite',
        }),
      );

      await expect(
        provider.translate({ text: 'Lesson', targetLanguage: 'pcm' }),
      ).rejects.toMatchObject({ code, retryable });
    },
  );
});
