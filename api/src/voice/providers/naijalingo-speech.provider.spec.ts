import { ConfigService } from '@nestjs/config';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { NaijaLingoSpeechProvider } from './naijalingo-speech.provider';
import { SpeechProviderError } from './speech-provider.error';

const wav = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([4, 0, 0, 0]),
  Buffer.from('WAVE'),
  Buffer.from('audio'),
]);

describe('NaijaLingoSpeechProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends only translated text with the matching speaker and language', async () => {
    const config = new ConfigService({
      NAIJALINGO_API_KEY: 'test-key',
      TTS_PROVIDER: 'naijalingo',
    });
    const provider = new NaijaLingoSpeechProvider(
      config,
      new VoicePolicyService(config),
    );
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve(
        new Response(wav, {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        }),
      ),
    );
    global.fetch = fetchMock;

    const result = await provider.synthesize({
      text: 'Agbara ni agbara lati se ise.',
      language: 'yo',
      signal: new AbortController().signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.9jalingo.org/v1/audio/speech');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-Key': 'test-key',
    });
    expect(request?.headers).not.toHaveProperty('Authorization');
    const body =
      typeof request?.body === 'string'
        ? (JSON.parse(request.body) as unknown)
        : null;
    expect(body).toEqual({
      input: 'Agbara ni agbara lati se ise.',
      model: '9jalingo-tts-1',
      voice: 'adeola_yo',
      lang: 'yo',
      response_format: 'wav',
    });
    expect(result).toMatchObject({
      provider: 'naijalingo',
      voice: 'adeola_yo',
      voiceId: 'adeola_yo',
      format: 'wav',
      contentType: 'audio/wav',
    });
    expect(result.audio).toEqual(wav);
  });

  it('fails closed for a missing key or malformed audio', async () => {
    const missingConfig = new ConfigService({ TTS_PROVIDER: 'naijalingo' });
    const missing = new NaijaLingoSpeechProvider(
      missingConfig,
      new VoicePolicyService(missingConfig),
    );
    await expect(
      missing.synthesize({
        text: 'How you dey?',
        language: 'pcm',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SPEECH_NOT_CONFIGURED' });

    const config = new ConfigService({
      NAIJALINGO_API_KEY: 'test-key',
      TTS_PROVIDER: 'naijalingo',
    });
    const provider = new NaijaLingoSpeechProvider(
      config,
      new VoicePolicyService(config),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response('not wav', {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        }),
      ),
    );
    await expect(
      provider.synthesize({
        text: 'How you dey?',
        language: 'pcm',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      new SpeechProviderError('SPEECH_PROVIDER_INVALID_AUDIO', false),
    );
  });

  it('does not retry the provider inference/input rejection', async () => {
    const config = new ConfigService({
      NAIJALINGO_API_KEY: 'test-key',
      TTS_PROVIDER: 'naijalingo',
    });
    const provider = new NaijaLingoSpeechProvider(
      config,
      new VoicePolicyService(config),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            detail: 'The inference service rejected the request.',
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    await expect(
      provider.synthesize({
        text: 'How you dey?',
        language: 'pcm',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      new SpeechProviderError('SPEECH_PROVIDER_INFERENCE_REJECTED', false),
    );
  });

  it('maps Nigerian Pidgin to the pcm language and pcm voice', async () => {
    const config = new ConfigService({
      NAIJALINGO_API_KEY: 'test-key',
      TTS_PROVIDER: 'naijalingo',
    });
    const provider = new NaijaLingoSpeechProvider(
      config,
      new VoicePolicyService(config),
    );
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() =>
      Promise.resolve(
        new Response(wav, {
          status: 200,
          headers: { 'content-type': 'audio/wav' },
        }),
      ),
    );
    global.fetch = fetchMock;

    await provider.synthesize({
      text: 'Energy na ability to do work.',
      language: 'pcm',
      signal: new AbortController().signal,
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body =
      typeof request?.body === 'string'
        ? (JSON.parse(request.body) as unknown)
        : null;
    expect(body).toMatchObject({
      lang: 'pcm',
      voice: 'ada_pcm',
    });
  });

  it.each([
    [429, 'SPEECH_PROVIDER_RATE_LIMITED', true],
    [502, 'SPEECH_PROVIDER_BAD_GATEWAY', true],
    [503, 'SPEECH_PROVIDER_UNAVAILABLE', true],
    [504, 'SPEECH_PROVIDER_GATEWAY_TIMEOUT', true],
    [404, 'SPEECH_PROVIDER_HTTP_ERROR', false],
  ] as const)(
    'classifies HTTP %s as %s with retryable=%s',
    async (status, code, retryable) => {
      const config = new ConfigService({
        NAIJALINGO_API_KEY: 'test-key',
        TTS_PROVIDER: 'naijalingo',
      });
      const provider = new NaijaLingoSpeechProvider(
        config,
        new VoicePolicyService(config),
      );
      global.fetch = jest.fn(() =>
        Promise.resolve(new Response('upstream error', { status })),
      );

      await expect(
        provider.synthesize({
          text: 'How you dey?',
          language: 'pcm',
          signal: new AbortController().signal,
        }),
      ).rejects.toEqual(new SpeechProviderError(code, retryable));
    },
  );

  it('distinguishes its own timeout from an application abort', async () => {
    jest.useFakeTimers();
    const config = new ConfigService({
      NAIJALINGO_API_KEY: 'test-key',
      TTS_PROVIDER: 'naijalingo',
      NAIJALINGO_TIMEOUT_MS: 100,
    });
    const provider = new NaijaLingoSpeechProvider(
      config,
      new VoicePolicyService(config),
    );
    global.fetch = jest.fn((_url, request) => {
      const signal = request?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const providerTimeout = provider.synthesize({
      text: 'How you dey?',
      language: 'pcm',
      signal: new AbortController().signal,
    });
    await jest.advanceTimersByTimeAsync(100);
    await expect(providerTimeout).rejects.toEqual(
      new SpeechProviderError('SPEECH_PROVIDER_TIMEOUT', true),
    );

    const controller = new AbortController();
    const applicationAbort = provider.synthesize({
      text: 'How you dey?',
      language: 'pcm',
      signal: controller.signal,
    });
    controller.abort();
    await expect(applicationAbort).rejects.toEqual(
      new SpeechProviderError('SPEECH_APPLICATION_TIMEOUT', true),
    );
    jest.useRealTimers();
  });
});
