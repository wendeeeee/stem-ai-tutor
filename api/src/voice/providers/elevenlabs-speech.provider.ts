import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpeechInput,
  SpeechProvider,
  SpeechResult,
} from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { SpeechProviderError } from './speech-provider.error';

const supportedContentTypes = new Set(['audio/mpeg', 'audio/mp3']);

@Injectable()
export class ElevenLabsSpeechProvider implements SpeechProvider {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly policy: VoicePolicyService,
  ) {
    this.apiKey = config.get<string>('ELEVEN_LABS_API_KEY')?.trim();
  }

  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    if (!this.apiKey || !this.policy.elevenLabsVoiceId) {
      throw new SpeechProviderError('SPEECH_NOT_CONFIGURED', false);
    }

    const url = new URL(
      `${this.policy.elevenLabsApiUrl}/text-to-speech/${encodeURIComponent(
        this.policy.elevenLabsVoiceId,
      )}`,
    );
    url.searchParams.set('output_format', this.policy.elevenLabsOutputFormat);
    if (!this.policy.elevenLabsEnableLogging) {
      url.searchParams.set('enable_logging', 'false');
    }

    const timeout = AbortSignal.timeout(this.policy.elevenLabsTimeoutMs);
    const signal = AbortSignal.any([input.signal, timeout]);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: input.text,
          model_id: this.policy.elevenLabsModelId,
          language_code: this.policy.elevenLabsLanguageCode,
        }),
        signal,
      });
    } catch (error: unknown) {
      throw this.networkError(error, signal);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_AUTHENTICATION_FAILED',
          false,
        );
      }
      if (response.status === 422) {
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_VALIDATION_FAILED',
          false,
        );
      }
      if (response.status === 429) {
        throw new SpeechProviderError('SPEECH_PROVIDER_RATE_LIMITED', true);
      }
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_HTTP_ERROR',
        response.status >= 500,
      );
    }

    const responseType = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (!responseType || !supportedContentTypes.has(responseType)) {
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_UNSUPPORTED_CONTENT_TYPE',
        false,
      );
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength !== null) {
      const declaredSize = Number(contentLength);
      if (
        !Number.isSafeInteger(declaredSize) ||
        declaredSize < 0 ||
        declaredSize > this.policy.elevenLabsMaxAudioResponseBytes
      ) {
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
          false,
        );
      }
    }

    let audio: Buffer;
    try {
      audio = await this.readBoundedAudio(response);
    } catch (error: unknown) {
      if (error instanceof SpeechProviderError) throw error;
      throw this.networkError(error, signal);
    }
    if (audio.length === 0) {
      throw new SpeechProviderError('SPEECH_PROVIDER_EMPTY_RESPONSE', true);
    }
    if (!this.hasMp3Signature(audio)) {
      throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
    }

    return {
      audio,
      provider: 'elevenlabs',
      apiVersion: 'v1',
      model: this.policy.elevenLabsModelId,
      voice: this.policy.elevenLabsVoiceName || 'Configured ElevenLabs voice',
      voiceId: this.policy.elevenLabsVoiceId,
      format: this.policy.elevenLabsOutputFormat,
      contentType: 'audio/mpeg',
      providerCharacterCost: this.characterCost(
        response.headers.get('character-cost'),
      ),
    };
  }

  private async readBoundedAudio(response: Response): Promise<Buffer> {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.policy.elevenLabsMaxAudioResponseBytes) {
        await reader.cancel();
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
          false,
        );
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  }

  private hasMp3Signature(audio: Buffer): boolean {
    return (
      audio.subarray(0, 3).toString('ascii') === 'ID3' ||
      (audio.length >= 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
    );
  }

  private characterCost(value: string | null): number | null {
    if (value === null || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private networkError(
    error: unknown,
    signal: AbortSignal,
  ): SpeechProviderError {
    if (
      signal.aborted ||
      (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError'))
    ) {
      return new SpeechProviderError('SPEECH_PROVIDER_TIMEOUT', true);
    }
    return new SpeechProviderError('SPEECH_PROVIDER_NETWORK_ERROR', true);
  }
}
