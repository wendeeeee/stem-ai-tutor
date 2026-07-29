import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SpeechFormat,
  SpeechInput,
  SpeechProvider,
  SpeechResult,
} from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { SpeechProviderError } from './speech-provider.error';

const contentTypes: Record<
  Exclude<SpeechFormat, 'aac' | 'mp3_44100_128'>,
  ReadonlySet<string>
> = {
  mp3: new Set(['audio/mpeg', 'audio/mp3']),
  wav: new Set(['audio/wav', 'audio/x-wav', 'audio/wave']),
  opus: new Set(['audio/ogg', 'audio/opus']),
  flac: new Set(['audio/flac', 'audio/x-flac']),
};

const browserContentTypes: Record<
  Exclude<SpeechFormat, 'aac' | 'mp3_44100_128'>,
  string
> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  flac: 'audio/flac',
};

@Injectable()
export class YarnGptSpeechProvider implements SpeechProvider {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly policy: VoicePolicyService,
  ) {
    this.apiKey = config.get<string>('YARN_GPT_API_KEY');
  }

  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    if (!this.apiKey) {
      throw new SpeechProviderError('SPEECH_NOT_CONFIGURED', false);
    }

    const timeout = AbortSignal.timeout(this.policy.yarnGptTimeoutMs);
    const signal = AbortSignal.any([input.signal, timeout]);
    let response: Response;
    try {
      response = await fetch(this.policy.yarnGptApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: browserContentTypes[this.policy.yarnGptFormat],
        },
        body: JSON.stringify({
          text: input.text,
          voice: this.policy.yarnGptVoice,
          response_format: this.policy.yarnGptFormat,
        }),
        signal,
      });
    } catch (error: unknown) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
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
      if (response.status === 429) {
        throw new SpeechProviderError('SPEECH_PROVIDER_RATE_LIMITED', true);
      }
      throw new SpeechProviderError('SPEECH_PROVIDER_HTTP_ERROR', true);
    }

    const responseType = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (
      !responseType ||
      !contentTypes[this.policy.yarnGptFormat].has(responseType)
    ) {
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_UNSUPPORTED_CONTENT_TYPE',
        false,
      );
    }

    const declaredSize = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredSize) &&
      declaredSize > this.policy.yarnGptMaxAudioResponseBytes
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
    if (audio.length > this.policy.yarnGptMaxAudioResponseBytes) {
      throw new SpeechProviderError(
        'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
        false,
      );
    }
    if (!this.hasExpectedAudioSignature(audio, this.policy.yarnGptFormat)) {
      throw new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false);
    }

    return {
      audio,
      provider: 'yarngpt',
      apiVersion: 'v1',
      model: 'yarngpt-tts-v1',
      voice: this.policy.yarnGptVoice,
      voiceId: null,
      format: this.policy.yarnGptFormat,
      contentType: browserContentTypes[this.policy.yarnGptFormat],
      providerCharacterCost: null,
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
      if (total > this.policy.yarnGptMaxAudioResponseBytes) {
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

  private hasExpectedAudioSignature(
    audio: Buffer,
    format: Exclude<SpeechFormat, 'aac' | 'mp3_44100_128'>,
  ): boolean {
    if (format === 'mp3') {
      return (
        audio.subarray(0, 3).toString('ascii') === 'ID3' ||
        (audio.length >= 2 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
      );
    }
    if (format === 'wav') {
      return (
        audio.length >= 12 &&
        audio.subarray(0, 4).toString('ascii') === 'RIFF' &&
        audio.subarray(8, 12).toString('ascii') === 'WAVE'
      );
    }
    if (format === 'opus') {
      return audio.subarray(0, 4).toString('ascii') === 'OggS';
    }
    return audio.subarray(0, 4).toString('ascii') === 'fLaC';
  }
}
