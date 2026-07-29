import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { extname } from 'node:path';
import { TranscriptionProvider } from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';
import { TRANSCRIPTION_PROVIDER } from '../voice.constants';
import { VoiceSessionService } from './voice-session.service';

export interface TranscriptionResponse {
  transcript: string;
  language: string;
  model: string;
  latencyMs: number;
  estimatedCostUsd: number;
  voiceSessionId: string;
}

const allowedMimeTypes = new Set([
  'audio/webm',
  'video/webm',
  'audio/ogg',
  'application/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'video/mp4',
  'audio/x-m4a',
  'audio/flac',
  'audio/x-flac',
]);

const allowedExtensions = new Set([
  '.webm',
  '.ogg',
  '.wav',
  '.mp3',
  '.mpeg',
  '.mpga',
  '.mp4',
  '.m4a',
  '.flac',
]);

@Injectable()
export class TranscriptionService {
  constructor(
    @Inject(TRANSCRIPTION_PROVIDER)
    private readonly provider: TranscriptionProvider,
    private readonly policy: VoicePolicyService,
    private readonly sessions: VoiceSessionService,
  ) {}

  async transcribe(
    file: Express.Multer.File | undefined,
    language: string,
    durationMs: number,
  ): Promise<TranscriptionResponse> {
    this.validate(file, durationMs);
    const audio = file as Express.Multer.File;
    const controller = new AbortController();
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        this.provider.transcribe({
          audio: audio.buffer,
          filename: audio.originalname,
          mimeType: this.normalizedMimeType(audio.mimetype),
          language,
          durationMs,
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('VOICE_PROVIDER_TIMEOUT'));
          }, this.policy.asrTimeoutMs);
        }),
      ]);
      const transcript = result.transcript.trim();
      if (!transcript) {
        throw new BadGatewayException(
          'The transcription provider returned an empty transcript.',
        );
      }
      const latencyMs = Date.now() - started;
      const estimatedCostUsd =
        (durationMs / 60_000) * this.policy.asrCostPerMinuteUsd;
      const session = await this.sessions.create(language, {
        model: result.model,
        latencyMs,
        durationMs,
        mimeType: this.normalizedMimeType(audio.mimetype),
        estimatedCostUsd,
        pricingVersion: this.policy.pricingVersion,
      });
      return {
        transcript,
        language,
        model: result.model,
        latencyMs,
        estimatedCostUsd,
        voiceSessionId: session.id,
      };
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) throw error;
      if (
        error instanceof Error &&
        error.message === 'VOICE_PROVIDER_TIMEOUT'
      ) {
        throw new GatewayTimeoutException(
          'Transcription timed out. Please try a shorter recording.',
        );
      }
      throw new BadGatewayException(
        'Transcription is temporarily unavailable. Your audio was not retained by this application.',
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private validate(
    file: Express.Multer.File | undefined,
    durationMs: number,
  ): void {
    if (!file || file.size === 0 || file.buffer.length === 0) {
      throw new BadRequestException('A non-empty audio recording is required.');
    }
    if (file.size > this.policy.maxAudioBytes) {
      throw new PayloadTooLargeException('The audio recording is too large.');
    }
    if (durationMs > this.policy.maxRecordingDurationMs) {
      throw new BadRequestException(
        'The audio recording exceeds the maximum duration.',
      );
    }
    const mime = file.mimetype.toLowerCase().split(';')[0];
    if (!allowedMimeTypes.has(mime)) {
      throw new BadRequestException('The audio format is not supported.');
    }
    if (!allowedExtensions.has(extname(file.originalname).toLowerCase())) {
      throw new BadRequestException('The audio filename is not supported.');
    }
    if (!this.hasRecognizableSignature(file.buffer)) {
      throw new BadRequestException('The audio file is malformed.');
    }
  }

  private hasRecognizableSignature(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    const ascii4 = buffer.subarray(0, 4).toString('ascii');
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      return true;
    if (ascii4 === 'OggS' || ascii4 === 'fLaC') return true;
    if (
      ascii4 === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WAVE'
    )
      return true;
    if (ascii4.slice(0, 3) === 'ID3') return true;
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }

  private normalizedMimeType(mimeType: string): string {
    const mime = mimeType.toLowerCase().split(';')[0];
    if (mime === 'video/webm') return 'audio/webm';
    if (mime === 'video/mp4' || mime === 'audio/x-m4a') return 'audio/mp4';
    if (mime === 'audio/x-wav') return 'audio/wav';
    if (mime === 'audio/mp3') return 'audio/mpeg';
    if (mime === 'audio/x-flac') return 'audio/flac';
    if (mime === 'application/ogg') return 'audio/ogg';
    return mime;
  }
}
