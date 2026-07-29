import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpeechFormat,
  SpeechProviderName,
  StandardSpeechFormat,
} from '../contracts/voice.contracts';
import { TUTOR_ANSWER_MAX_CHARACTERS } from '../../tutor/contracts/tutor-limits';
import { OutputLanguage } from '../../tutor/translation/translation.contracts';

const speechFormats = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const;
const yarnGptFormats = ['mp3', 'opus', 'flac', 'wav'] as const;
const elevenLabsFormats = ['mp3_44100_128'] as const;
const elevenLabsModelCharacterLimits: Readonly<Record<string, number>> = {
  eleven_v3: 5_000,
  eleven_flash_v2_5: 40_000,
  eleven_flash_v2: 30_000,
  eleven_turbo_v2_5: 40_000,
  eleven_turbo_v2: 30_000,
  eleven_multilingual_v2: 10_000,
  eleven_multilingual_v1: 10_000,
};

@Injectable()
export class VoicePolicyService {
  readonly maxAudioBytes: number;
  readonly maxRecordingDurationMs: number;
  readonly asrModel: string;
  readonly asrTimeoutMs: number;
  readonly asrCostPerMinuteUsd: number;
  readonly asrRequestsPerMinute: number;
  readonly defaultLanguage: string;
  readonly ttsModel: string;
  readonly ttsVoice: string;
  readonly ttsFormat: StandardSpeechFormat;
  readonly ttsTimeoutMs: number;
  readonly ttsCostPerMinuteUsd: number;
  readonly ttsCharactersPerSecond: number;
  readonly ttsMaxInputCharacters: number;
  readonly ttsRequestsPerMinute: number;
  readonly ttsChunkMinimumCharacters: number;
  readonly ttsChunkPreferredCharacters: number;
  readonly ttsChunkMaximumCharacters: number;
  readonly ttsChunkMaxRetries: number;
  readonly ttsChunkRetryBaseDelayMs: number;
  readonly ttsApplicationTimeoutMs: number;
  readonly ttsChunkCacheTtlMs: number;
  readonly ttsChunkCacheMaxBytes: number;
  readonly ttsMaxTotalAudioBytes: number;
  readonly pricingVersion: string;
  readonly sseHeartbeatMs: number;
  readonly ttsProvider: SpeechProviderName;
  readonly naijaLingoApiUrl: string;
  readonly naijaLingoModel: string;
  readonly naijaLingoFormat: 'wav';
  readonly naijaLingoMaxInputCharacters: number;
  readonly naijaLingoTimeoutMs: number;
  readonly naijaLingoMaxAudioResponseBytes: number;
  readonly naijaLingoVoices: Readonly<Record<OutputLanguage, string>>;
  readonly naijaLingoPricingVersion: string;
  readonly naijaLingoPricingCurrency: string;
  readonly naijaLingoPricingEffectiveDate: string | null;
  readonly naijaLingoCostPerThousandCharacters: number | null;
  readonly yarnGptApiUrl: string;
  readonly yarnGptVoice: string;
  readonly yarnGptFormat: (typeof yarnGptFormats)[number];
  readonly yarnGptMaxInputCharacters: number;
  readonly yarnGptTimeoutMs: number;
  readonly yarnGptMaxAudioResponseBytes: number;
  readonly yarnGptPricingVersion: string;
  readonly yarnGptPricingCurrency: string;
  readonly yarnGptPricingEffectiveDate: string | null;
  readonly yarnGptCostPerThousandCharacters: number | null;
  readonly elevenLabsApiUrl: string;
  readonly elevenLabsVoiceId: string;
  readonly elevenLabsVoiceName: string;
  readonly elevenLabsModelId: string;
  readonly elevenLabsOutputFormat: (typeof elevenLabsFormats)[number];
  readonly elevenLabsLanguageCode: string;
  readonly elevenLabsMaxInputCharacters: number;
  readonly elevenLabsTimeoutMs: number;
  readonly elevenLabsMaxAudioResponseBytes: number;
  readonly elevenLabsEnableLogging: boolean;
  readonly elevenLabsPricingVersion: string;
  readonly elevenLabsPricingCurrency: string;
  readonly elevenLabsPricingEffectiveDate: string | null;
  readonly elevenLabsCostPerThousandCharacters: number | null;

  constructor(config: ConfigService) {
    this.maxAudioBytes = this.integer(
      config,
      'VOICE_MAX_AUDIO_BYTES',
      8_388_608,
      1_024,
    );
    this.maxRecordingDurationMs =
      this.integer(config, 'VOICE_MAX_RECORDING_SECONDS', 30, 1) * 1_000;
    this.asrModel = config.get<string>(
      'ASR_MODEL',
      'gpt-4o-mini-transcribe-2025-12-15',
    );
    this.asrTimeoutMs = this.integer(config, 'ASR_TIMEOUT_MS', 20_000, 100);
    this.asrCostPerMinuteUsd = this.decimal(
      config,
      'ASR_COST_PER_MINUTE_USD',
      0.003,
      0,
    );
    this.asrRequestsPerMinute = this.integer(
      config,
      'ASR_REQUESTS_PER_MINUTE',
      10,
      1,
    );
    this.defaultLanguage = config.get<string>('ASR_DEFAULT_LANGUAGE', 'en');
    const provider = config.get<string>('TTS_PROVIDER', 'naijalingo');
    if (
      provider !== 'naijalingo' &&
      provider !== 'elevenlabs' &&
      provider !== 'yarngpt' &&
      provider !== 'openai'
    ) {
      throw new Error(
        'TTS_PROVIDER must be one of naijalingo, elevenlabs, yarngpt, or openai.',
      );
    }
    this.ttsProvider = provider;
    this.ttsModel = config.get<string>(
      'TTS_MODEL',
      'gpt-4o-mini-tts-2025-12-15',
    );
    this.ttsVoice = config.get<string>('TTS_VOICE', 'cedar');
    const format = config.get<string>('TTS_FORMAT', 'mp3');
    if (!speechFormats.includes(format as (typeof speechFormats)[number])) {
      throw new Error(`TTS_FORMAT must be one of ${speechFormats.join(', ')}.`);
    }
    this.ttsFormat = format as (typeof speechFormats)[number];
    this.ttsTimeoutMs = this.integer(config, 'TTS_TIMEOUT_MS', 20_000, 100);
    this.ttsCostPerMinuteUsd = this.decimal(
      config,
      'TTS_COST_PER_MINUTE_USD',
      0.015,
      0,
    );
    this.ttsCharactersPerSecond = this.decimal(
      config,
      'TTS_ESTIMATED_CHARACTERS_PER_SECOND',
      14,
      1,
    );
    this.ttsMaxInputCharacters = this.integer(
      config,
      'TTS_MAX_INPUT_CHARACTERS',
      4_096,
      1,
    );
    this.ttsRequestsPerMinute = this.integer(
      config,
      'TTS_REQUESTS_PER_MINUTE',
      10,
      1,
    );
    this.ttsChunkMinimumCharacters = this.integer(
      config,
      'TTS_CHUNK_MIN_CHARACTERS',
      400,
      1,
    );
    this.ttsChunkPreferredCharacters = this.integer(
      config,
      'TTS_CHUNK_PREFERRED_CHARACTERS',
      550,
      1,
    );
    this.ttsChunkMaximumCharacters = this.integer(
      config,
      'TTS_CHUNK_MAX_CHARACTERS',
      700,
      1,
    );
    this.ttsChunkMaxRetries = this.integer(
      config,
      'TTS_CHUNK_MAX_RETRIES',
      2,
      0,
    );
    this.ttsChunkRetryBaseDelayMs = this.integer(
      config,
      'TTS_CHUNK_RETRY_BASE_DELAY_MS',
      500,
      0,
    );
    this.ttsApplicationTimeoutMs = this.integer(
      config,
      'TTS_APPLICATION_TIMEOUT_MS',
      65_000,
      100,
    );
    this.ttsChunkCacheTtlMs = this.integer(
      config,
      'TTS_CHUNK_CACHE_TTL_MS',
      900_000,
      1_000,
    );
    this.ttsChunkCacheMaxBytes = this.integer(
      config,
      'TTS_CHUNK_CACHE_MAX_BYTES',
      67_108_864,
      1_024,
    );
    this.ttsMaxTotalAudioBytes = this.integer(
      config,
      'TTS_MAX_TOTAL_AUDIO_BYTES',
      25_165_824,
      1_024,
    );
    this.pricingVersion = config.get<string>(
      'VOICE_PRICING_VERSION',
      '2026-07-23',
    );
    this.naijaLingoApiUrl = this.httpsUrl(
      config.get<string>('NAIJALINGO_API_URL', 'https://api.9jalingo.org'),
      'NAIJALINGO_API_URL',
    ).replace(/\/$/, '');
    this.naijaLingoModel =
      config.get<string>('NAIJALINGO_MODEL', '9jalingo-tts-1').trim() ||
      '9jalingo-tts-1';
    this.naijaLingoFormat = 'wav';
    this.naijaLingoMaxInputCharacters = Math.min(
      TUTOR_ANSWER_MAX_CHARACTERS * 2,
      this.integer(config, 'NAIJALINGO_MAX_INPUT_CHARACTERS', 8_000, 1),
    );
    this.naijaLingoTimeoutMs = this.integer(
      config,
      'NAIJALINGO_TIMEOUT_MS',
      120_000,
      100,
    );
    this.naijaLingoMaxAudioResponseBytes = this.integer(
      config,
      'NAIJALINGO_MAX_AUDIO_RESPONSE_BYTES',
      20_971_520,
      1_024,
    );
    this.naijaLingoVoices = {
      pcm:
        config.get<string>('NAIJALINGO_VOICE_PCM', 'ada_pcm').trim() ||
        'ada_pcm',
      ig:
        config.get<string>('NAIJALINGO_VOICE_IG', 'adaeze_ig').trim() ||
        'adaeze_ig',
      yo:
        config.get<string>('NAIJALINGO_VOICE_YO', 'adeola_yo').trim() ||
        'adeola_yo',
      ha:
        config.get<string>('NAIJALINGO_VOICE_HA', 'aisha_ha').trim() ||
        'aisha_ha',
    };
    this.naijaLingoPricingVersion =
      config.get<string>('NAIJALINGO_PRICING_VERSION', 'unconfigured') ||
      'unconfigured';
    this.naijaLingoPricingCurrency =
      config.get<string>('NAIJALINGO_PRICING_CURRENCY', 'NGN') || 'NGN';
    this.naijaLingoPricingEffectiveDate =
      config.get<string>('NAIJALINGO_PRICING_EFFECTIVE_DATE') || null;
    this.naijaLingoCostPerThousandCharacters = this.optionalDecimal(
      config,
      'NAIJALINGO_COST_PER_1000_CHARACTERS',
    );
    this.yarnGptApiUrl = this.httpsUrl(
      config.get<string>('YARN_GPT_API_URL', 'https://yarngpt.ai/api/v1/tts'),
      'YARN_GPT_API_URL',
    );
    this.yarnGptVoice = config.get<string>('YARN_GPT_VOICE', 'Chinenye');
    const yarnFormat = config.get<string>('YARN_GPT_RESPONSE_FORMAT', 'mp3');
    if (
      !yarnGptFormats.includes(yarnFormat as (typeof yarnGptFormats)[number])
    ) {
      throw new Error(
        `YARN_GPT_RESPONSE_FORMAT must be one of ${yarnGptFormats.join(', ')}.`,
      );
    }
    this.yarnGptFormat = yarnFormat as (typeof yarnGptFormats)[number];
    this.yarnGptMaxInputCharacters = Math.min(
      2_000,
      this.integer(config, 'YARN_GPT_MAX_INPUT_CHARACTERS', 2_000, 1),
    );
    this.yarnGptTimeoutMs = this.integer(
      config,
      'YARN_GPT_TIMEOUT_MS',
      30_000,
      100,
    );
    this.yarnGptMaxAudioResponseBytes = this.integer(
      config,
      'YARN_GPT_MAX_AUDIO_RESPONSE_BYTES',
      10_485_760,
      1_024,
    );
    this.yarnGptPricingVersion = config.get<string>(
      'YARN_GPT_PRICING_VERSION',
      'unconfigured-2026-07-24',
    );
    this.yarnGptPricingCurrency = config.get<string>(
      'YARN_GPT_PRICING_CURRENCY',
      'NGN',
    );
    this.yarnGptPricingEffectiveDate =
      config.get<string>('YARN_GPT_PRICING_EFFECTIVE_DATE') || null;
    this.yarnGptCostPerThousandCharacters = this.optionalDecimal(
      config,
      'YARN_GPT_COST_PER_1000_CHARACTERS',
    );
    this.elevenLabsApiUrl = this.httpsUrl(
      config.get<string>('ELEVEN_LABS_API_URL', 'https://api.elevenlabs.io/v1'),
      'ELEVEN_LABS_API_URL',
    ).replace(/\/$/, '');
    this.elevenLabsVoiceId =
      config.get<string>('ELEVEN_LABS_VOICE_ID', '').trim() || '';
    this.elevenLabsVoiceName =
      config.get<string>('ELEVEN_LABS_VOICE_NAME', '').trim() || '';
    this.elevenLabsModelId =
      config.get<string>('ELEVEN_LABS_MODEL_ID', 'eleven_flash_v2_5').trim() ||
      'eleven_flash_v2_5';
    const elevenLabsFormat = config.get<string>(
      'ELEVEN_LABS_OUTPUT_FORMAT',
      'mp3_44100_128',
    );
    if (
      !elevenLabsFormats.includes(
        elevenLabsFormat as (typeof elevenLabsFormats)[number],
      )
    ) {
      throw new Error(
        `ELEVEN_LABS_OUTPUT_FORMAT must be one of ${elevenLabsFormats.join(', ')}.`,
      );
    }
    this.elevenLabsOutputFormat =
      elevenLabsFormat as (typeof elevenLabsFormats)[number];
    this.elevenLabsLanguageCode =
      config.get<string>('ELEVEN_LABS_LANGUAGE_CODE', 'en').trim() || 'en';
    const configuredElevenLabsLimit = this.integer(
      config,
      'ELEVEN_LABS_MAX_INPUT_CHARACTERS',
      40_000,
      1,
    );
    const documentedModelLimit =
      elevenLabsModelCharacterLimits[this.elevenLabsModelId] ??
      configuredElevenLabsLimit;
    this.elevenLabsMaxInputCharacters = Math.min(
      configuredElevenLabsLimit,
      documentedModelLimit,
      TUTOR_ANSWER_MAX_CHARACTERS,
    );
    this.elevenLabsTimeoutMs = this.integer(
      config,
      'ELEVEN_LABS_TIMEOUT_MS',
      120_000,
      100,
    );
    this.elevenLabsMaxAudioResponseBytes = this.integer(
      config,
      'ELEVEN_LABS_MAX_AUDIO_RESPONSE_BYTES',
      20_971_520,
      1_024,
    );
    this.elevenLabsEnableLogging = this.boolean(
      config,
      'ELEVEN_LABS_ENABLE_LOGGING',
      true,
    );
    this.elevenLabsPricingVersion =
      config.get<string>(
        'ELEVEN_LABS_PRICING_VERSION',
        'api-pricing-2026-07-24',
      ) || 'api-pricing-2026-07-24';
    this.elevenLabsPricingCurrency =
      config.get<string>('ELEVEN_LABS_PRICING_CURRENCY', 'USD') || 'USD';
    this.elevenLabsPricingEffectiveDate =
      config.get<string>('ELEVEN_LABS_PRICING_EFFECTIVE_DATE') || '2026-07-24';
    this.elevenLabsCostPerThousandCharacters =
      this.optionalDecimal(config, 'ELEVEN_LABS_COST_PER_1000_CHARACTERS') ??
      0.05;
    this.sseHeartbeatMs = this.integer(
      config,
      'SSE_HEARTBEAT_INTERVAL_MS',
      15_000,
      1_000,
    );

    if (this.maxAudioBytes > 25 * 1024 * 1024) {
      throw new Error('VOICE_MAX_AUDIO_BYTES must not exceed 25 MB.');
    }
    if (this.maxRecordingDurationMs > 120_000) {
      throw new Error('VOICE_MAX_RECORDING_SECONDS must not exceed 120.');
    }
    if (this.yarnGptMaxAudioResponseBytes > 25 * 1024 * 1024) {
      throw new Error(
        'YARN_GPT_MAX_AUDIO_RESPONSE_BYTES must not exceed 25 MB.',
      );
    }
    if (this.elevenLabsMaxAudioResponseBytes > 25 * 1024 * 1024) {
      throw new Error(
        'ELEVEN_LABS_MAX_AUDIO_RESPONSE_BYTES must not exceed 25 MB.',
      );
    }
    if (this.naijaLingoMaxAudioResponseBytes > 25 * 1024 * 1024) {
      throw new Error(
        'NAIJALINGO_MAX_AUDIO_RESPONSE_BYTES must not exceed 25 MB.',
      );
    }
    if (
      this.ttsChunkMinimumCharacters > this.ttsChunkPreferredCharacters ||
      this.ttsChunkPreferredCharacters > this.ttsChunkMaximumCharacters
    ) {
      throw new Error(
        'TTS chunk sizes must satisfy minimum <= preferred <= maximum.',
      );
    }
    if (this.ttsChunkMaximumCharacters > 2_000) {
      throw new Error('TTS_CHUNK_MAX_CHARACTERS must not exceed 2000.');
    }
    if (this.ttsMaxTotalAudioBytes > 100 * 1024 * 1024) {
      throw new Error('TTS_MAX_TOTAL_AUDIO_BYTES must not exceed 100 MB.');
    }
  }

  get selectedTtsTimeoutMs(): number {
    if (this.ttsProvider === 'naijalingo') return this.naijaLingoTimeoutMs;
    if (this.ttsProvider === 'elevenlabs') return this.elevenLabsTimeoutMs;
    if (this.ttsProvider === 'yarngpt') return this.yarnGptTimeoutMs;
    return this.ttsTimeoutMs;
  }

  get selectedTtsMaxInputCharacters(): number {
    if (this.ttsProvider === 'naijalingo') {
      return this.naijaLingoMaxInputCharacters;
    }
    if (this.ttsProvider === 'elevenlabs') {
      return this.elevenLabsMaxInputCharacters;
    }
    if (this.ttsProvider === 'yarngpt') {
      return this.yarnGptMaxInputCharacters;
    }
    return Math.min(this.ttsMaxInputCharacters, TUTOR_ANSWER_MAX_CHARACTERS);
  }

  get selectedTtsVoice(): string {
    if (this.ttsProvider === 'naijalingo') {
      return this.naijaLingoVoices.pcm;
    }
    if (this.ttsProvider === 'elevenlabs') {
      return this.elevenLabsVoiceName || 'Configured ElevenLabs voice';
    }
    return this.ttsProvider === 'yarngpt' ? this.yarnGptVoice : this.ttsVoice;
  }

  get selectedTtsVoiceId(): string | null {
    if (this.ttsProvider === 'naijalingo') {
      return this.naijaLingoVoices.pcm;
    }
    if (this.ttsProvider === 'elevenlabs') {
      return this.elevenLabsVoiceId || null;
    }
    return null;
  }

  get selectedTtsFormat(): SpeechFormat {
    if (this.ttsProvider === 'naijalingo') return this.naijaLingoFormat;
    if (this.ttsProvider === 'elevenlabs') {
      return this.elevenLabsOutputFormat;
    }
    return this.ttsProvider === 'yarngpt' ? this.yarnGptFormat : this.ttsFormat;
  }

  get selectedTtsModel(): string {
    if (this.ttsProvider === 'naijalingo') return this.naijaLingoModel;
    if (this.ttsProvider === 'elevenlabs') return this.elevenLabsModelId;
    return this.ttsProvider === 'yarngpt' ? 'yarngpt-tts-v1' : this.ttsModel;
  }

  selectedTtsVoiceFor(language: OutputLanguage): string {
    return this.ttsProvider === 'naijalingo'
      ? this.naijaLingoVoices[language]
      : this.selectedTtsVoice;
  }

  selectedTtsVoiceIdFor(language: OutputLanguage): string | null {
    return this.ttsProvider === 'naijalingo'
      ? this.naijaLingoVoices[language]
      : this.selectedTtsVoiceId;
  }

  private integer(
    config: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
  ): number {
    const value = Number(config.get<string | number>(key, fallback));
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${key} must be an integer of at least ${minimum}.`);
    }
    return value;
  }

  private decimal(
    config: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
  ): number {
    const value = Number(config.get<string | number>(key, fallback));
    if (!Number.isFinite(value) || value < minimum) {
      throw new Error(`${key} must be at least ${minimum}.`);
    }
    return value;
  }

  private optionalDecimal(config: ConfigService, key: string): number | null {
    const raw = config.get<string | number>(key);
    if (raw === undefined || raw === null || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${key} must be blank or a non-negative number.`);
    }
    return value;
  }

  private boolean(
    config: ConfigService,
    key: string,
    fallback: boolean,
  ): boolean {
    const raw = config.get<string | boolean>(key, fallback);
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    throw new Error(`${key} must be true or false.`);
  }

  private httpsUrl(value: string, key: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${key} must be a valid HTTPS URL.`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(`${key} must use HTTPS.`);
    }
    return parsed.toString();
  }
}
