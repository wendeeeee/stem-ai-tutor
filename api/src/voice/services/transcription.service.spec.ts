/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { TranscriptionProvider } from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { VoiceSessionService } from './voice-session.service';
import { TranscriptionService } from './transcription.service';

const webm = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(32, 1),
]);

function audioFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  const buffer = overrides.buffer ?? webm;
  return {
    fieldname: 'audio',
    originalname: 'question.webm',
    encoding: '7bit',
    mimetype: 'audio/webm',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  };
}

function policy(
  overrides: Partial<VoicePolicyService> = {},
): VoicePolicyService {
  return {
    maxAudioBytes: 1_024,
    maxRecordingDurationMs: 30_000,
    asrTimeoutMs: 50,
    asrCostPerMinuteUsd: 0.003,
    pricingVersion: 'test-pricing',
    ...overrides,
  } as VoicePolicyService;
}

describe('TranscriptionService', () => {
  const sessions = {
    create: jest.fn(() =>
      Promise.resolve({ id: '194bdce5-8a48-49ec-99f3-82ae1460f350' }),
    ),
  } as unknown as VoiceSessionService;

  beforeEach(() => jest.clearAllMocks());

  it('transcribes valid audio and persists metrics without audio bytes', async () => {
    const provider: TranscriptionProvider = {
      transcribe: jest.fn(() =>
        Promise.resolve({
          transcript: ' What is kinetic energy? ',
          model: 'fake-asr',
        }),
      ),
    };
    const service = new TranscriptionService(provider, policy(), sessions);

    const result = await service.transcribe(audioFile(), 'en', 2_000);

    expect(result).toEqual(
      expect.objectContaining({
        transcript: 'What is kinetic energy?',
        language: 'en',
        model: 'fake-asr',
        voiceSessionId: '194bdce5-8a48-49ec-99f3-82ae1460f350',
      }),
    );
    expect(sessions.create).toHaveBeenCalledWith(
      'en',
      expect.objectContaining({
        durationMs: 2_000,
        mimeType: 'audio/webm',
      }),
    );
    expect(sessions.create).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ audio: expect.anything() }),
    );
  });

  it('rejects missing and empty audio', async () => {
    const service = new TranscriptionService(
      { transcribe: jest.fn() },
      policy(),
      sessions,
    );
    await expect(service.transcribe(undefined, 'en', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.transcribe(
        audioFile({ buffer: Buffer.alloc(0), size: 0 }),
        'en',
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported, malformed, oversized, and overlong audio', async () => {
    const service = new TranscriptionService(
      { transcribe: jest.fn() },
      policy({ maxAudioBytes: 40 }),
      sessions,
    );
    await expect(
      service.transcribe(
        audioFile({ mimetype: 'audio/aiff', originalname: 'question.aiff' }),
        'en',
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.transcribe(
        audioFile({ buffer: Buffer.alloc(20, 7), size: 20 }),
        'en',
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.transcribe(
        audioFile({ buffer: Buffer.concat([webm, webm]), size: 72 }),
        'en',
        1,
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(
      service.transcribe(audioFile(), 'en', 31_000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns safe provider failure and timeout errors', async () => {
    const failed = new TranscriptionService(
      { transcribe: jest.fn(() => Promise.reject(new Error('secret body'))) },
      policy(),
      sessions,
    );
    await expect(
      failed.transcribe(audioFile(), 'en', 1_000),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const timedOut = new TranscriptionService(
      { transcribe: jest.fn(() => new Promise(() => undefined)) },
      policy({ asrTimeoutMs: 1 }),
      sessions,
    );
    await expect(
      timedOut.transcribe(audioFile(), 'en', 1_000),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
