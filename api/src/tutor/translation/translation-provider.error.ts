export class TranslationProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'TranslationProviderError';
  }
}

export function translationSafeMessage(code: string): string {
  switch (code) {
    case 'TRANSLATION_NOT_CONFIGURED':
      return 'Translation is not configured. Set GEMINI_API_Key and restart the API.';
    case 'TRANSLATION_AUTH_FAILED':
      return 'Gemini rejected the translation API key. Check GEMINI_API_Key and its API restrictions.';
    case 'TRANSLATION_QUOTA_EXCEEDED':
      return "Gemini translation quota is exhausted. Check the Gemini project's quota or billing, then retry.";
    case 'TRANSLATION_MODEL_UNAVAILABLE':
      return 'The configured Gemini translation model is unavailable to this API key.';
    case 'TRANSLATION_REQUEST_REJECTED':
      return 'Gemini rejected the translation request configuration.';
    case 'TRANSLATION_TIMEOUT':
      return 'Gemini translation timed out. Please retry.';
    case 'TRANSLATION_PROVIDER_UNAVAILABLE':
      return 'Gemini translation is temporarily unavailable. Please retry.';
    default:
      return 'The grounded answer could not be translated safely.';
  }
}
