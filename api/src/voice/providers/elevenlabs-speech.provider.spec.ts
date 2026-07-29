/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { ElevenLabsSpeechProvider } from './elevenlabs-speech.provider';
import { SpeechProviderError } from './speech-provider.error';

const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32, 1)]);

function setup(values: Record<string, string | number | boolean> = {}): {
  credential: string;
  policy: VoicePolicyService;
  provider: ElevenLabsSpeechProvider;
} {
  const credential = ['configured', 'elevenlabs', 'test', 'credential'].join(
    '-',
  );
  const config = new ConfigService({
    ELEVEN_LABS_API_KEY: credential,
    ELEVEN_LABS_VOICE_ID: 'Tutor/Voice ?1',
    ELEVEN_LABS_VOICE_NAME: 'Ada Tutor',
    ELEVEN_LABS_TIMEOUT_MS: 100,
    ELEVEN_LABS_MAX_AUDIO_RESPONSE_BYTES: 1_024,
    ...values,
  });
  const policy = new VoicePolicyService(config);
  return {
    credential,
    policy,
    provider: new ElevenLabsSpeechProvider(config, policy),
  };
}

function response(
  body: BodyInit | null,
  contentType = 'audio/mpeg',
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType, ...headers },
  });
}

function arrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe('ElevenLabsSpeechProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the encoded voice endpoint, xi-api-key, and exact synthesis fields', async () => {
    const { provider, credential } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(
        response(arrayBuffer(mp3), 'audio/mpeg', 200, {
          'character-cost': '37',
        }),
      ),
    ) as jest.Mock;

    const result = await provider.synthesize({
      text: 'A cleaned canonical grounded answer.',
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      provider: 'elevenlabs',
      apiVersion: 'v1',
      model: 'eleven_flash_v2_5',
      voice: 'Ada Tutor',
      voiceId: 'Tutor/Voice ?1',
      format: 'mp3_44100_128',
      contentType: 'audio/mpeg',
      providerCharacterCost: 37,
    });
    expect(result.audio).toEqual(mp3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/Tutor%2FVoice%20%3F1?output_format=mp3_44100_128',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'xi-api-key': credential,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: 'A cleaned canonical grounded answer.',
        model_id: 'eleven_flash_v2_5',
        language_code: 'en',
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('requests zero retention only when logging is explicitly disabled', async () => {
    const { provider } = setup({ ELEVEN_LABS_ENABLE_LOGGING: false });
    global.fetch = jest.fn(() =>
      Promise.resolve(response(arrayBuffer(mp3))),
    ) as jest.Mock;

    await provider.synthesize({
      text: 'Canonical answer',
      signal: new AbortController().signal,
    });

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [URL];
    expect(url.searchParams.get('enable_logging')).toBe('false');
  });

  it.each([
    [401, 'SPEECH_PROVIDER_AUTHENTICATION_FAILED'],
    [403, 'SPEECH_PROVIDER_AUTHENTICATION_FAILED'],
    [422, 'SPEECH_PROVIDER_VALIDATION_FAILED'],
    [429, 'SPEECH_PROVIDER_RATE_LIMITED'],
    [500, 'SPEECH_PROVIDER_HTTP_ERROR'],
  ])('maps HTTP %i to safe code %s', async (status, code) => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(response('raw upstream failure', 'text/html', status)),
    ) as jest.Mock;

    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code });
  });

  it('rejects JSON, HTML, malformed, and empty successful responses', async () => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(response('{"detail":"error"}', 'application/json')),
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
      Promise.resolve(response('<html>error</html>')),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_PROVIDER_INVALID_AUDIO' });

    global.fetch = jest.fn(() =>
      Promise.resolve(response(arrayBuffer(Buffer.from('not an mp3')))),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_PROVIDER_INVALID_AUDIO' });

    global.fetch = jest.fn(() =>
      Promise.resolve(response(new Uint8Array())),
    ) as jest.Mock;
    await expect(
      provider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_PROVIDER_EMPTY_RESPONSE' });
  });

  it('enforces declared and streamed response-size limits', async () => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(
        response(arrayBuffer(mp3), 'audio/mpeg', 200, {
          'content-length': '2048',
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
      Promise.resolve(response(new Uint8Array(1_025).buffer)),
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

  it('uses a provider timeout signal and maps aborts safely', async () => {
    const { provider } = setup({ ELEVEN_LABS_TIMEOUT_MS: 100 });
    global.fetch = jest.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
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

  it('ignores an invalid character-cost header without treating it as currency', async () => {
    const { provider } = setup();
    global.fetch = jest.fn(() =>
      Promise.resolve(
        response(arrayBuffer(mp3), 'audio/mpeg', 200, {
          'character-cost': '-2 credits',
        }),
      ),
    ) as jest.Mock;

    const result = await provider.synthesize({
      text: 'Canonical answer',
      signal: new AbortController().signal,
    });

    expect(result.providerCharacterCost).toBeNull();
  });

  it('fails before fetch when the key or voice ID is missing', async () => {
    const missingKey = new ConfigService({
      ELEVEN_LABS_VOICE_ID: 'voice-id',
    });
    const missingKeyProvider = new ElevenLabsSpeechProvider(
      missingKey,
      new VoicePolicyService(missingKey),
    );
    await expect(
      missingKeyProvider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_NOT_CONFIGURED' });

    const missingVoice = new ConfigService({
      ELEVEN_LABS_API_KEY: 'configured-test-key',
    });
    const missingVoiceProvider = new ElevenLabsSpeechProvider(
      missingVoice,
      new VoicePolicyService(missingVoice),
    );
    await expect(
      missingVoiceProvider.synthesize({
        text: 'Canonical answer',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_NOT_CONFIGURED' });
    expect(global.fetch).toBe(originalFetch);
  });
});
