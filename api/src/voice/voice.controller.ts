import {
  Body,
  Controller,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { TranscribeAudioDto } from './dto/transcribe-audio.dto';
import { VoicePolicyService } from './policies/voice-policy.service';
import { SpeechService } from './services/speech.service';
import {
  TranscriptionResponse,
  TranscriptionService,
} from './services/transcription.service';
import { VoiceRateLimitService } from './services/voice-rate-limit.service';

@Controller()
export class VoiceController {
  constructor(
    private readonly transcriptions: TranscriptionService,
    private readonly speech: SpeechService,
    private readonly rateLimits: VoiceRateLimitService,
    private readonly policy: VoicePolicyService,
  ) {}

  @Post('voice/transcriptions')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 4 },
    }),
  )
  transcribe(
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body() input: TranscribeAudioDto,
    @Ip() ip: string,
  ): Promise<TranscriptionResponse> {
    this.rateLimits.assert(`asr:${ip}`, this.policy.asrRequestsPerMinute);
    return this.transcriptions.transcribe(
      audio,
      input.language,
      input.durationMs,
    );
  }

  @Post('tutor/runs/:runId/speech')
  async synthesize(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Ip() ip: string,
    @Res() response: Response,
  ): Promise<void> {
    this.rateLimits.assert(`tts:${ip}`, this.policy.ttsRequestsPerMinute);
    const speech = await this.speech.synthesize(runId);
    response.set({
      'Content-Type': speech.contentType,
      'Cache-Control': 'no-store, private',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'X-Voice-Session-Id': speech.voiceSessionId,
      'X-TTS-Provider': speech.provider,
      'X-TTS-API-Version': speech.apiVersion,
      'X-TTS-Model': speech.model,
      'X-TTS-Voice': speech.voice,
      'X-TTS-Format': speech.format,
      'X-TTS-Latency-Ms': String(speech.latencyMs),
      'X-TTS-Input-Characters': String(speech.characterCount),
      'X-TTS-Chunk-Count': String(speech.chunkCount),
      'X-TTS-Output-Bytes': String(speech.outputByteCount),
      'X-TTS-Cost-Status': speech.costStatus,
      'X-TTS-Pricing-Currency': speech.pricingCurrency,
      'X-TTS-Pricing-Version': speech.pricingVersion,
    });
    if (speech.voiceId) {
      response.set('X-TTS-Voice-Id', speech.voiceId);
    }
    if (speech.providerCharacterCost !== null) {
      response.set(
        'X-TTS-Provider-Character-Cost',
        String(speech.providerCharacterCost),
      );
    }
    if (speech.pricingRatePerThousandCharacters !== null) {
      response.set(
        'X-TTS-Pricing-Rate-Per-1000-Characters',
        String(speech.pricingRatePerThousandCharacters),
      );
    }
    if (speech.estimatedCost !== null) {
      response.set('X-TTS-Estimated-Cost', speech.estimatedCost.toFixed(8));
    }
    if (speech.estimatedCostUsd !== null) {
      response.set(
        'X-TTS-Estimated-Cost-Usd',
        speech.estimatedCostUsd.toFixed(8),
      );
    }
    if (speech.pricingEffectiveDate) {
      response.set('X-TTS-Pricing-Effective-Date', speech.pricingEffectiveDate);
    }
    response.send(speech.audio);
  }
}
