import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TutorRun } from '../tutor/entities/tutor-run.entity';
import { VoiceSession } from './entities/voice-session.entity';
import { VoicePolicyService } from './policies/voice-policy.service';
import { OpenAiSpeechProvider } from './providers/openai-speech.provider';
import { OpenAiTranscriptionProvider } from './providers/openai-transcription.provider';
import { YarnGptSpeechProvider } from './providers/yarngpt-speech.provider';
import { ElevenLabsSpeechProvider } from './providers/elevenlabs-speech.provider';
import { SpeechService } from './services/speech.service';
import { TranscriptionService } from './services/transcription.service';
import { VoiceRateLimitService } from './services/voice-rate-limit.service';
import { VoiceSessionService } from './services/voice-session.service';
import { SPEECH_PROVIDER, TRANSCRIPTION_PROVIDER } from './voice.constants';
import { VoiceController } from './voice.controller';
import { ReinforcementAttempt } from '../tutor/reinforcement/reinforcement-attempt.entity';
import { SpeechProvider } from './contracts/voice.contracts';
import { NaijaLingoSpeechProvider } from './providers/naijalingo-speech.provider';
import { SpeechChunkCacheService } from './services/speech-chunk-cache.service';

export function selectSpeechProvider(
  policy: VoicePolicyService,
  naijaLingo: NaijaLingoSpeechProvider,
  elevenLabs: ElevenLabsSpeechProvider,
  yarnGpt: YarnGptSpeechProvider,
  openAi: OpenAiSpeechProvider,
): SpeechProvider {
  if (policy.ttsProvider === 'naijalingo') return naijaLingo;
  if (policy.ttsProvider === 'elevenlabs') return elevenLabs;
  if (policy.ttsProvider === 'yarngpt') return yarnGpt;
  return openAi;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([VoiceSession, TutorRun, ReinforcementAttempt]),
  ],
  controllers: [VoiceController],
  providers: [
    VoicePolicyService,
    VoiceSessionService,
    VoiceRateLimitService,
    TranscriptionService,
    SpeechService,
    SpeechChunkCacheService,
    OpenAiTranscriptionProvider,
    OpenAiSpeechProvider,
    YarnGptSpeechProvider,
    ElevenLabsSpeechProvider,
    NaijaLingoSpeechProvider,
    {
      provide: TRANSCRIPTION_PROVIDER,
      useExisting: OpenAiTranscriptionProvider,
    },
    {
      provide: SPEECH_PROVIDER,
      inject: [
        VoicePolicyService,
        NaijaLingoSpeechProvider,
        ElevenLabsSpeechProvider,
        YarnGptSpeechProvider,
        OpenAiSpeechProvider,
      ],
      useFactory: selectSpeechProvider,
    },
  ],
  exports: [VoicePolicyService, VoiceSessionService],
})
export class VoiceModule {}
