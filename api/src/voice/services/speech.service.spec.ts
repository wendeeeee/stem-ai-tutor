/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { TutorRun } from '../../tutor/entities/tutor-run.entity';
import { SpeechProvider } from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { SpeechProviderError } from '../providers/speech-provider.error';
import { SpeechService } from './speech.service';
import { VoiceSessionService } from './voice-session.service';
import { SpeechChunkCacheService } from './speech-chunk-cache.service';

function pcmWav(data: Buffer): Buffer {
  const output = Buffer.alloc(44 + data.length + (data.length % 2));
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(16_000, 24);
  output.writeUInt32LE(32_000, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(data.length, 40);
  data.copy(output, 44);
  return output;
}

function groundedRun(overrides: Partial<TutorRun> = {}): TutorRun {
  return {
    id: '055c79a0-c1db-47f2-9312-a54670b45bef',
    status: 'completed',
    language: 'en',
    outputLanguage: 'pcm',
    finalAnswer: 'Energy is the capacity to do work.',
    translatedAnswer: 'Energy na di ability to do work.',
    grounding: {
      grounded: true,
      reasons: [],
      checkedCitationIds: ['chunk-1'],
      revisionRecommended: false,
      revisionGuidance: null,
      unsupportedClaims: [],
    },
    refused: false,
    voiceSessionId: '194bdce5-8a48-49ec-99f3-82ae1460f350',
    ...overrides,
  } as TutorRun;
}

function setup(
  run: TutorRun | null,
  provider: SpeechProvider = {
    synthesize: jest.fn(() =>
      Promise.resolve({
        audio: Buffer.from('audio'),
        provider: 'openai',
        apiVersion: 'v1',
        model: 'fake-tts',
        voice: 'cedar',
        format: 'mp3',
        contentType: 'audio/mpeg',
      }),
    ),
  },
  timeoutMs = 50,
  maxInputCharacters = 4_096,
  policyOverrides: Partial<VoicePolicyService> = {},
) {
  const runs = {
    findOne: jest.fn(() => Promise.resolve(run)),
    update: jest.fn(() => Promise.resolve()),
  } as unknown as Repository<TutorRun>;
  const sessions = {
    saveTts: jest.fn(() => Promise.resolve()),
    createForTextRun: jest.fn(() =>
      Promise.resolve({
        id: '51f3658e-21f5-4e41-904f-cafb75db38da',
      }),
    ),
  } as unknown as VoiceSessionService;
  const policy = {
    ttsProvider: 'openai',
    ttsTimeoutMs: timeoutMs,
    selectedTtsTimeoutMs: timeoutMs,
    ttsCharactersPerSecond: 14,
    ttsMaxInputCharacters: 4_096,
    selectedTtsMaxInputCharacters: maxInputCharacters,
    selectedTtsModel: 'fake-tts',
    selectedTtsVoice: 'cedar',
    selectedTtsVoiceId: null,
    selectedTtsVoiceFor: jest.fn(() => 'cedar'),
    selectedTtsVoiceIdFor: jest.fn(() => null),
    selectedTtsFormat: 'mp3',
    ttsCostPerMinuteUsd: 0.015,
    pricingVersion: 'test-pricing',
    yarnGptCostPerThousandCharacters: null,
    yarnGptPricingCurrency: 'NGN',
    yarnGptPricingEffectiveDate: null,
    yarnGptPricingVersion: 'unconfigured',
    elevenLabsCostPerThousandCharacters: 0.05,
    elevenLabsPricingCurrency: 'USD',
    elevenLabsPricingEffectiveDate: '2026-07-24',
    elevenLabsPricingVersion: 'api-pricing-2026-07-24',
    naijaLingoCostPerThousandCharacters: null,
    naijaLingoPricingCurrency: 'NGN',
    naijaLingoPricingEffectiveDate: null,
    naijaLingoPricingVersion: 'unconfigured',
    ttsChunkMinimumCharacters: 400,
    ttsChunkPreferredCharacters: 550,
    ttsChunkMaximumCharacters: 700,
    ttsChunkMaxRetries: 0,
    ttsChunkRetryBaseDelayMs: 0,
    ttsApplicationTimeoutMs: timeoutMs,
    ttsChunkCacheTtlMs: 60_000,
    ttsChunkCacheMaxBytes: 10_000_000,
    ttsMaxTotalAudioBytes: 10_000_000,
    ...policyOverrides,
  } as unknown as VoicePolicyService;
  const chunkCache = new SpeechChunkCacheService(policy);
  return {
    service: new SpeechService(runs, provider, policy, sessions, chunkCache),
    runs,
    sessions,
    provider,
  };
}

describe('SpeechService', () => {
  it('synthesizes only the persisted translation and stores metrics', async () => {
    const run = groundedRun();
    const { service, provider, sessions } = setup(run);

    const result = await service.synthesize(run.id);

    expect(provider.synthesize).toHaveBeenCalledWith({
      text: run.translatedAnswer,
      language: run.outputLanguage,
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(
      expect.objectContaining({
        contentType: 'audio/mpeg',
        model: 'fake-tts',
        voiceSessionId: run.voiceSessionId,
      }),
    );
    expect(sessions.saveTts).toHaveBeenCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        characterCount: run.translatedAnswer?.length,
        estimatedCostUsd: expect.any(Number),
      }),
    );
  });

  it('removes Markdown markers before speech without changing the stored answer', async () => {
    const finalAnswer = `Hi, let us explore this together.

### What is **energy**?

- Energy is the capacity to do work.`;
    const run = groundedRun({ translatedAnswer: finalAnswer });
    const { service, provider, sessions } = setup(run);

    await service.synthesize(run.id);

    const speechText = `Hi, let us explore this together.

What is energy?

Energy is the capacity to do work.`;
    expect(provider.synthesize).toHaveBeenCalledWith({
      text: speechText,
      language: 'pcm',
      signal: expect.any(AbortSignal),
    });
    expect(run.translatedAnswer).toBe(finalAnswer);
    expect(sessions.saveTts).toHaveBeenCalledWith(
      run.voiceSessionId,
      expect.objectContaining({ characterCount: speechText.length }),
    );
  });

  it.each([
    ['refused', groundedRun({ status: 'refused', refused: true })],
    ['failed', groundedRun({ status: 'failed' })],
    ['running', groundedRun({ status: 'running' })],
    ['missing answer', groundedRun({ finalAnswer: null })],
    ['missing translation', groundedRun({ translatedAnswer: null })],
    [
      'ungrounded',
      groundedRun({
        grounding: {
          grounded: false,
          reasons: ['unsupported'],
          checkedCitationIds: [],
          revisionRecommended: false,
          revisionGuidance: null,
          unsupportedClaims: [],
        },
      }),
    ],
  ])('rejects a %s run', async (_label, run) => {
    const context = setup(run);
    await expect(context.service.synthesize(run.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(context.provider.synthesize).not.toHaveBeenCalled();
  });

  it('rejects an unknown run', async () => {
    const context = setup(null);
    await expect(context.service.synthesize('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(context.provider.synthesize).not.toHaveBeenCalled();
  });

  it('creates a metrics-only voice session for a text-originated run', async () => {
    const run = groundedRun({ voiceSessionId: null });
    const { service, sessions, runs } = setup(run);
    const result = await service.synthesize(run.id);

    expect(sessions.createForTextRun).toHaveBeenCalled();
    expect(runs.update).toHaveBeenCalledWith(run.id, {
      voiceSessionId: result.voiceSessionId,
    });
  });

  it('preserves an overlong answer as text without calling the speech provider', async () => {
    const run = groundedRun({ translatedAnswer: 'x'.repeat(4_097) });
    const { service, provider, sessions } = setup(run);

    await expect(service.synthesize(run.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(provider.synthesize).not.toHaveBeenCalled();
    expect(sessions.saveTts).toHaveBeenCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        success: false,
        failureCode: 'SPEECH_INPUT_TOO_LONG',
        outputByteCount: 0,
      }),
    );
  });

  it('accepts a cleaned grounded answer above 2,000 characters within the selected 8,000-character limit', async () => {
    const run = groundedRun({
      translatedAnswer: `A${' answer'.repeat(400)}`,
    });
    const { service, provider } = setup(run, undefined, 50, 8_000);

    await service.synthesize(run.id);

    expect(run.translatedAnswer?.length).toBeGreaterThan(2_000);
    expect(provider.synthesize).toHaveBeenCalledWith({
      text: run.translatedAnswer,
      language: 'pcm',
      signal: expect.any(AbortSignal),
    });
  });

  it('records ElevenLabs voice, character-cost, and estimated list-price metrics separately', async () => {
    const run = groundedRun({ translatedAnswer: 'x'.repeat(2_500) });
    const provider: SpeechProvider = {
      synthesize: jest.fn(() =>
        Promise.resolve({
          audio: Buffer.from('ID3audio'),
          provider: 'elevenlabs',
          apiVersion: 'v1',
          model: 'eleven_flash_v2_5',
          voice: 'Ada Tutor',
          voiceId: 'voice-id',
          format: 'mp3_44100_128',
          contentType: 'audio/mpeg',
          providerCharacterCost: 2_500,
        }),
      ),
    };
    const { service, sessions } = setup(run, provider, 50, 8_000);

    const result = await service.synthesize(run.id);

    expect(result).toMatchObject({
      provider: 'elevenlabs',
      estimatedCost: 0.125,
      estimatedCostUsd: 0.125,
      pricingRatePerThousandCharacters: 0.05,
      providerCharacterCost: 2_500,
    });
    expect(sessions.saveTts).toHaveBeenCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        voice: 'Ada Tutor',
        voiceId: 'voice-id',
        providerCharacterCost: 2_500,
        estimatedCost: 0.125,
        costStatus: 'estimated',
      }),
    );
  });

  it('rejects an answer containing no speakable text', async () => {
    const run = groundedRun({
      translatedAnswer: `### 

---`,
    });
    const { service, provider } = setup(run);

    await expect(service.synthesize(run.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('returns safe provider failure and timeout errors', async () => {
    const failure = setup(groundedRun(), {
      synthesize: jest.fn(() => Promise.reject(new Error('raw provider body'))),
    });
    await expect(
      failure.service.synthesize(groundedRun().id),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(failure.sessions.saveTts).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        success: false,
        failureCode: 'SPEECH_PROVIDER_ERROR',
      }),
    );

    const timeout = setup(
      groundedRun(),
      { synthesize: jest.fn(() => new Promise(() => undefined)) },
      1,
    );
    await expect(
      timeout.service.synthesize(groundedRun().id),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(timeout.sessions.saveTts).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        success: false,
        failureCode: 'SPEECH_APPLICATION_TIMEOUT',
      }),
    );
  });

  it('returns an actionable message for a 9jaLingo inference rejection', async () => {
    const failure = setup(groundedRun(), {
      synthesize: jest.fn(() =>
        Promise.reject(
          new SpeechProviderError('SPEECH_PROVIDER_INFERENCE_REJECTED', true),
        ),
      ),
    });

    await expect(
      failure.service.synthesize(groundedRun().id),
    ).rejects.toMatchObject({
      message:
        'The 9jaLingo inference service rejected synthesis. Please retry later or check the API account status. The written answer is still available.',
    });
    expect(failure.sessions.saveTts).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        success: false,
        failureCode: 'SPEECH_PROVIDER_INFERENCE_REJECTED',
      }),
    );
  });

  it('chunks multi-paragraph 9jaLingo lessons sequentially and assembles WAV data in order', async () => {
    const lesson = [
      `First paragraph. ${'alpha concept '.repeat(35)}`,
      `Second paragraph. ${'beta concept '.repeat(35)}`,
      `Third paragraph. ${'gamma concept '.repeat(35)}`,
    ].join('\n\n');
    const run = groundedRun({ translatedAnswer: lesson });
    const provider: SpeechProvider = {
      synthesize: jest.fn(({ text }) => {
        const order = text.startsWith('First')
          ? 1
          : text.startsWith('Second')
            ? 2
            : 3;
        return Promise.resolve({
          audio: pcmWav(Buffer.from([order, order])),
          provider: 'naijalingo',
          apiVersion: 'v1',
          model: '9jalingo-tts-1',
          voice: 'ada_pcm',
          voiceId: 'ada_pcm',
          format: 'wav',
          contentType: 'audio/wav',
        });
      }),
    };
    const { service, sessions } = setup(run, provider, 50, 8_000, {
      ttsProvider: 'naijalingo',
      selectedTtsFormat: 'wav',
      selectedTtsModel: '9jalingo-tts-1',
      selectedTtsVoiceFor: jest.fn(() => 'ada_pcm'),
      selectedTtsVoiceIdFor: jest.fn(() => 'ada_pcm'),
    });

    const result = await service.synthesize(run.id);

    expect(provider.synthesize).toHaveBeenCalledTimes(3);
    expect(
      (provider.synthesize as jest.Mock).mock.calls.map(
        ([input]: [{ text: string }]) => input.text.split(' ')[0],
      ),
    ).toEqual(['First', 'Second', 'Third']);
    expect(result.chunkCount).toBe(3);
    expect(result.audio.subarray(44, 50)).toEqual(
      Buffer.from([1, 1, 2, 2, 3, 3]),
    );
    expect(sessions.saveTts).toHaveBeenLastCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        success: true,
        chunkCount: 3,
        failedChunkIndex: null,
        outputByteCount: result.audio.length,
        chunks: [
          expect.objectContaining({ index: 0, success: true, retryCount: 0 }),
          expect.objectContaining({ index: 1, success: true, retryCount: 0 }),
          expect.objectContaining({ index: 2, success: true, retryCount: 0 }),
        ],
      }),
    );
  });

  it('retries a transient chunk failure and records the retry count', async () => {
    const lesson = [
      `First paragraph. ${'alpha concept '.repeat(35)}`,
      `Second paragraph. ${'beta concept '.repeat(35)}`,
    ].join('\n\n');
    let secondAttempts = 0;
    const provider: SpeechProvider = {
      synthesize: jest.fn(({ text }) => {
        if (text.startsWith('Second') && secondAttempts++ === 0) {
          return Promise.reject(
            new SpeechProviderError('SPEECH_PROVIDER_UNAVAILABLE', true),
          );
        }
        return Promise.resolve({
          audio: pcmWav(Buffer.from([text.startsWith('First') ? 1 : 2, 0])),
          provider: 'naijalingo',
          apiVersion: 'v1',
          model: '9jalingo-tts-1',
          voice: 'ada_pcm',
          voiceId: 'ada_pcm',
          format: 'wav',
          contentType: 'audio/wav',
        });
      }),
    };
    const { service, sessions } = setup(runFor(lesson), provider, 50, 8_000, {
      ttsProvider: 'naijalingo',
      selectedTtsFormat: 'wav',
      ttsChunkMaxRetries: 2,
      selectedTtsVoiceFor: jest.fn(() => 'ada_pcm'),
      selectedTtsVoiceIdFor: jest.fn(() => 'ada_pcm'),
    });

    await service.synthesize(groundedRun().id);

    expect(provider.synthesize).toHaveBeenCalledTimes(3);
    expect(sessions.saveTts).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        success: true,
        chunks: expect.arrayContaining([
          expect.objectContaining({ index: 1, retryCount: 1 }),
        ]),
      }),
    );
  });

  it('caches completed chunks so a later request resumes at the failed chunk', async () => {
    const lesson = [
      `First paragraph. ${'alpha concept '.repeat(35)}`,
      `Second paragraph. ${'beta concept '.repeat(35)}`,
      `Third paragraph. ${'gamma concept '.repeat(35)}`,
    ].join('\n\n');
    let secondFailuresRemaining = 2;
    const callsByOpening = new Map<string, number>();
    const provider: SpeechProvider = {
      synthesize: jest.fn(({ text }) => {
        const opening = text.split(' ')[0];
        callsByOpening.set(opening, (callsByOpening.get(opening) ?? 0) + 1);
        if (opening === 'Second' && secondFailuresRemaining-- > 0) {
          return Promise.reject(
            new SpeechProviderError('SPEECH_PROVIDER_RATE_LIMITED', true),
          );
        }
        const order = opening === 'First' ? 1 : opening === 'Second' ? 2 : 3;
        return Promise.resolve({
          audio: pcmWav(Buffer.from([order, order])),
          provider: 'naijalingo',
          apiVersion: 'v1',
          model: '9jalingo-tts-1',
          voice: 'ada_pcm',
          voiceId: 'ada_pcm',
          format: 'wav',
          contentType: 'audio/wav',
        });
      }),
    };
    const run = groundedRun({ translatedAnswer: lesson });
    const { service, sessions } = setup(run, provider, 50, 8_000, {
      ttsProvider: 'naijalingo',
      selectedTtsFormat: 'wav',
      ttsChunkMaxRetries: 1,
      selectedTtsVoiceFor: jest.fn(() => 'ada_pcm'),
      selectedTtsVoiceIdFor: jest.fn(() => 'ada_pcm'),
    });

    await expect(service.synthesize(run.id)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(sessions.saveTts).toHaveBeenLastCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        success: false,
        failedChunkIndex: 1,
        failureCode: 'SPEECH_PROVIDER_RATE_LIMITED',
        chunks: [
          expect.objectContaining({ index: 0, success: true }),
          expect.objectContaining({
            index: 1,
            success: false,
            retryCount: 1,
          }),
        ],
      }),
    );

    const result = await service.synthesize(run.id);

    expect(callsByOpening.get('First')).toBe(1);
    expect(callsByOpening.get('Second')).toBe(3);
    expect(callsByOpening.get('Third')).toBe(1);
    expect(result.audio.subarray(44, 50)).toEqual(
      Buffer.from([1, 1, 2, 2, 3, 3]),
    );
    expect(sessions.saveTts).toHaveBeenLastCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        success: true,
        chunks: [
          expect.objectContaining({ index: 0, cached: true }),
          expect.objectContaining({ index: 1, cached: false }),
          expect.objectContaining({ index: 2, cached: false }),
        ],
      }),
    );
  });

  it.each([
    'SPEECH_PROVIDER_AUTHENTICATION_FAILED',
    'SPEECH_PROVIDER_VALIDATION_FAILED',
  ] as const)('does not retry %s', async (code) => {
    const provider: SpeechProvider = {
      synthesize: jest.fn(() =>
        Promise.reject(new SpeechProviderError(code, false)),
      ),
    };
    const run = groundedRun({
      translatedAnswer: `Lesson. ${'content without a stop '.repeat(35)}`,
    });
    const { service, sessions } = setup(run, provider, 50, 8_000, {
      ttsProvider: 'naijalingo',
      ttsChunkMaxRetries: 3,
      selectedTtsVoiceFor: jest.fn(() => 'ada_pcm'),
      selectedTtsVoiceIdFor: jest.fn(() => 'ada_pcm'),
    });

    await expect(service.synthesize(run.id)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    expect(sessions.saveTts).toHaveBeenLastCalledWith(
      run.voiceSessionId,
      expect.objectContaining({
        success: false,
        failedChunkIndex: 0,
        failureCode: code,
        chunks: [expect.objectContaining({ retryCount: 0, success: false })],
      }),
    );
  });
});

function runFor(translatedAnswer: string): TutorRun {
  return groundedRun({ translatedAnswer });
}
