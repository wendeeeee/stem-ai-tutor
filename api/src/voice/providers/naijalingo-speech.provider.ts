import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpeechInput,
  SpeechProvider,
  SpeechResult,
} from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { SpeechProviderError } from './speech-provider.error';

const wavContentTypes = new Set(['audio/wav', 'audio/x-wav', 'audio/wave']);

@Injectable()
export class NaijaLingoSpeechProvider implements SpeechProvider {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly policy: VoicePolicyService,
  ) {
    this.apiKey = config.get<string>('NAIJALINGO_API_KEY')?.trim();
  }

  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    if (!this.apiKey) {
      throw new SpeechProviderError('SPEECH_NOT_CONFIGURED', false);
    }
    const language = input.language ?? 'pcm';
    const voice = this.policy.naijaLingoVoices[language];
    const timeout = AbortSignal.timeout(this.policy.naijaLingoTimeoutMs);
    const signal = AbortSignal.any([input.signal, timeout]);
    let response: Response;
    try {
      response = await fetch(
        `${this.policy.naijaLingoApiUrl}/v1/audio/speech`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          body: JSON.stringify({
            input: input.text,
            model: this.policy.naijaLingoModel,
            voice,
            lang: language,
            response_format: this.policy.naijaLingoFormat,
          }),
          signal,
        },
      );
    } catch (error: unknown) {
      if (timeout.aborted) {
        throw new SpeechProviderError('SPEECH_PROVIDER_TIMEOUT', true);
      }
      if (input.signal.aborted) {
        throw new SpeechProviderError('SPEECH_APPLICATION_TIMEOUT', true);
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new SpeechProviderError('SPEECH_PROVIDER_TIMEOUT', true);
      }
      throw new SpeechProviderError('SPEECH_PROVIDER_NETWORK_ERROR', true);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_AUTHENTICATION_FAILED',
          false,
        );
      }
      if (response.status === 422 || response.status === 400) {
        if (await this.isInferenceServiceRejection(response)) {
          throw new SpeechProviderError(
            'SPEECH_PROVIDER_INFERENCE_REJECTED',
            false,
          );
        }
        throw new SpeechProviderError(
          'SPEECH_PROVIDER_VALIDATION_FAILED',
          false,
        );
      }
      if (response.status === 429) {
        throw new SpeechProviderError('SPEECH_PROVIDER_RATE_LIMITED', true);
      }
      if (response.status === 502) {
        throw new SpeechProviderError('SPEECH_PROVIDER_BAD_GATEWAY', true);
      }
      if (response.status === 503) {
        throw new SpeechProviderError('SPEECH_PROVIDER_UNAVAILABLE', true);
      }
      if (response.status === 504) {
        throw new SpeechProviderError('SPEECH_PROVIDER_GATEWAY_TIMEOUT', true);
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
    if (!responseType || !wavContentTypes.has(responseType)) {
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_UNSUPPORTED_CONTENT_TYPE',
        false,
      );
    }
    const declaredSize = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredSize) &&
      declaredSize > this.policy.naijaLingoMaxAudioResponseBytes
    ) {
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
        false,
      );
    }

    const audio = await this.readBoundedAudio(response);
    if (audio.length === 0) {
      throw new SpeechProviderError('SPEECH_PROVIDER_EMPTY_RESPONSE', true);
    }
    if (!this.isWav(audio)) {
      throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
    }

    return {
      audio,
      provider: 'naijalingo',
      apiVersion: 'v1',
      model: this.policy.naijaLingoModel,
      voice,
      voiceId: voice,
      format: 'wav',
      contentType: 'audio/wav',
      providerCharacterCost: null,
    };
  }

  private async isInferenceServiceRejection(
    response: Response,
  ): Promise<boolean> {
    if (!response.body) return false;
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    const maxErrorBytes = 512;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxErrorBytes) {
          await reader.cancel();
          return false;
        }
        chunks.push(Buffer.from(value));
      }
      const parsed = JSON.parse(
        Buffer.concat(chunks, total).toString('utf8'),
      ) as unknown;
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        'detail' in parsed &&
        (parsed as { detail?: unknown }).detail ===
          'The inference service rejected the request.'
      );
    } catch {
      return false;
    }
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
      if (total > this.policy.naijaLingoMaxAudioResponseBytes) {
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

  private isWav(audio: Buffer): boolean {
    return (
      audio.length >= 12 &&
      audio.subarray(0, 4).toString('ascii') === 'RIFF' &&
      audio.subarray(8, 12).toString('ascii') === 'WAVE'
    );
  }
}
