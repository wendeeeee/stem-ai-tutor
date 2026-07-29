/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { SpeechFormat } from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { SpeechProviderError } from './speech-provider.error';
import { YarnGptSpeechProvider } from './yarngpt-speech.provider';

const audioFixtures: Record<
  Exclude<SpeechFormat, 'aac' | 'mp3_44100_128'>,
  Buffer
> = {
  mp3: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32, 1)]),
  wav: Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WAVE'),
    Buffer.alloc(24, 1),
  ]),
  opus: Buffer.concat([Buffer.from('OggS'), Buffer.alloc(32, 1)]),
  flac: Buffer.concat([Buffer.from('fLaC'), Buffer.alloc(32, 1)]),
};

const mimeTypes: Record<
  Exclude<SpeechFormat, 'aac' | 'mp3_44100_128'>,
  string
> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  flac: 'audio/flac',
};

function setup(
  format: Exclude<SpeechFormat, 'aac' | 'mp3_44100_128'> = 'mp3',
  timeout = 100,
) {
  const credential = ['configured', 'test', 'credential'].join('-');
  const config = new ConfigService({
    YARN_GPT_API_KEY: credential,
    YARN_GPT_RESPONSE_FORMAT: format,
    YARN_GPT_TIMEOUT_MS: timeout,
    YARN_GPT_MAX_AUDIO_RESPONSE_BYTES: 1_024,
  });
  const policy = new VoicePolicyService(config);
  return {
    credential,
    provider: new YarnGptSpeechProvider(config, policy),
    policy,
  };
}

function response(body: BodyInit | null, contentType: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

function body(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe('YarnGptSpeechProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each(['mp3', 'wav', 'opus', 'flac'] as const)(
    'validates and returns documented %s audio',
    async (format) => {
      const { provider, credential, policy } = setup(format);
      global.fetch = jest.fn(() =>
        Promise.resolve(
          response(body(audioFixtures[format]), mimeTypes[format]),
        ),
      ) as jest.Mock;

      const result = await provider.synthesize({
        text: 'A canonical grounded answer.',
        signal: new AbortController().signal,
      });

      expect(result).toMatchObject({
        provider: 'yarngpt',
        apiVersion: 'v1',
        model: 'yarngpt-tts-v1',
        voice: 'Chinenye',
        format,
        contentType: mimeTypes[format],
      });
      expect(result.audio).toEqual(audioFixtures[format]);
      expect(global.fetch).toHaveBeenCalledWith(
        policy.yarnGptApiUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${credential}`,
          }),
          body: JSON.stringify({
            text: 'A canonical grounded answer.',
            voice: 'Chinenye',
            response_format: format,
          }),
        }),
      );
    },
  );

  it('rejects unsupported content types and disguised non-audio bodies', async () => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(response('{"error":"upstream"}', 'application/json')),
    ) as jest.Mock;

    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'SPEECH_PROVIDER_UNSUPPORTED_CONTENT_TYPE',
    });

    global.fetch = jest.fn(() =>
      Promise.resolve(response('<html>error</html>', 'audio/mpeg')),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_PROVIDER_INVALID_AUDIO' });
  });

  it('rejects empty and oversized responses', async () => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(response(new Uint8Array(), 'audio/mpeg')),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_PROVIDER_EMPTY_RESPONSE' });

    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(body(audioFixtures.mp3), {
          headers: {
            'content-type': 'audio/mpeg',
            'content-length': '2048',
          },
        }),
      ),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
    });

    global.fetch = jest.fn(() =>
      Promise.resolve(response(new Uint8Array(1_025).buffer, 'audio/mpeg')),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'SPEECH_PROVIDER_RESPONSE_TOO_LARGE',
    });
  });

  it.each([
    [401, 'SPEECH_PROVIDER_AUTHENTICATION_FAILED'],
    [403, 'SPEECH_PROVIDER_AUTHENTICATION_FAILED'],
    [429, 'SPEECH_PROVIDER_RATE_LIMITED'],
    [500, 'SPEECH_PROVIDER_HTTP_ERROR'],
  ])('maps HTTP %i to a safe code', async (status, code) => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(response('raw provider failure', 'text/html', status)),
    ) as jest.Mock;

    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('uses a provider timeout signal and maps it safely', async () => {
    const { provider } = setup('mp3', 100);
    global.fetch = jest.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    ) as jest.Mock;

    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SpeechProviderError>>({
        code: 'SPEECH_PROVIDER_TIMEOUT',
      }),
    );
  });

  it('fails safely without a configured server credential', async () => {
    const config = new ConfigService({});
    const provider = new YarnGptSpeechProvider(
      config,
      new VoicePolicyService(config),
    );
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_NOT_CONFIGURED' });
  });
});
