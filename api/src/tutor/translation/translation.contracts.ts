export const supportedOutputLanguages = ['pcm', 'ig', 'yo', 'ha'] as const;

export type OutputLanguage = (typeof supportedOutputLanguages)[number];

export const outputLanguageLabels: Readonly<Record<OutputLanguage, string>> = {
  pcm: 'Nigerian Pidgin',
  ig: 'Igbo',
  yo: 'Yoruba',
  ha: 'Hausa',
};

export interface TranslationInput {
  text: string;
  targetLanguage: OutputLanguage;
  signal?: AbortSignal;
}

export interface TranslationResult {
  translatedText: string;
  provider: 'gemini';
  model: string;
  sourceLanguage: 'en';
  targetLanguage: OutputLanguage;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}

export interface TranslationMetadata extends Omit<
  TranslationResult,
  'translatedText'
> {
  inputCharacters: number;
  outputCharacters: number;
  latencyMs: number;
}
