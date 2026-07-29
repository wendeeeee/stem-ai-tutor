import { translationSafeMessage } from './translation-provider.error';

describe('translationSafeMessage', () => {
  it('provides an actionable quota message without provider payloads', () => {
    expect(translationSafeMessage('TRANSLATION_QUOTA_EXCEEDED')).toBe(
      "Gemini translation quota is exhausted. Check the Gemini project's quota or billing, then retry.",
    );
  });

  it('keeps unknown provider failures generic', () => {
    expect(translationSafeMessage('UNKNOWN')).toBe(
      'The grounded answer could not be translated safely.',
    );
  });
});
