export interface TranscriptionInput {
  audio: Buffer;
  filename: string;
  mimeType: string;
  language: string;
  durationMs: number;
  signal: AbortSignal;
}

export interface TranscriptionResult {
  transcript: string;
  model: string;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

export type SpeechFormat =
  'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'mp3_44100_128';
export type SpeechProviderName =
  'naijalingo' | 'elevenlabs' | 'openai' | 'yarngpt';
export type StandardSpeechFormat = Exclude<SpeechFormat, 'mp3_44100_128'>;

export interface SpeechInput {
  text: string;
  language?: 'pcm' | 'ig' | 'yo' | 'ha';
  signal: AbortSignal;
}

export interface SpeechResult {
  audio: Buffer;
  provider: SpeechProviderName;
  apiVersion: string;
  model: string;
  voice: string;
  voiceId?: string | null;
  format: SpeechFormat;
  contentType: string;
  providerCharacterCost?: number | null;
}

export interface SpeechProvider {
  synthesize(input: SpeechInput): Promise<SpeechResult>;
}

export interface VoiceStageMetrics {
  model: string;
  latencyMs: number;
  estimatedCostUsd: number | null;
  pricingVersion: string;
}

export interface AsrMetrics extends VoiceStageMetrics {
  durationMs: number;
  mimeType: string;
}

export interface TtsMetrics extends VoiceStageMetrics {
  provider: SpeechProviderName;
  apiVersion: string;
  voice: string;
  voiceId: string | null;
  format: SpeechFormat;
  characterCount: number;
  outputByteCount: number;
  providerCharacterCost: number | null;
  estimatedAudioDurationMs: number | null;
  chunkCount: number;
  chunks: TtsChunkMetrics[];
  failedChunkIndex: number | null;
  totalSynthesisLatencyMs: number;
  success: boolean;
  failureCode: string | null;
  costStatus: 'estimated' | 'unavailable';
  estimatedCost: number | null;
  pricingCurrency: string;
  pricingEffectiveDate: string | null;
  pricingRatePerThousandCharacters: number | null;
}

export interface TtsChunkMetrics {
  index: number;
  characterCount: number;
  latencyMs: number;
  retryCount: number;
  outputByteCount: number;
  success: boolean;
  failureCode: string | null;
  cached: boolean;
}

export interface VoiceMetrics {
  voiceSessionId: string;
  asr: AsrMetrics | null;
  tts: TtsMetrics | null;
}
