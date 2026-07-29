import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  SpeechInput,
  SpeechProvider,
  SpeechResult,
} from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';

const contentTypes = {
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
} as const;

@Injectable()
export class OpenAiSpeechProvider implements SpeechProvider {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly policy: VoicePolicyService,
  ) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
  }

  async synthesize(input: SpeechInput): Promise<SpeechResult> {
    if (!this.apiKey) throw new Error('SPEECH_NOT_CONFIGURED');
    const client = new OpenAI({
      apiKey: this.apiKey,
      timeout: this.policy.ttsTimeoutMs,
      maxRetries: 0,
    });
    const response = await client.audio.speech.create(
      {
        model: this.policy.ttsModel,
        voice: this.policy.ttsVoice,
        input: input.text,
        response_format: this.policy.ttsFormat,
        instructions:
          'Speak as a warm, patient, encouraging STEM tutor for a secondary-school learner. Sound conversational, genuinely empathetic, and interested in making science enjoyable, never theatrical or patronising. Use a measured pace, natural pauses between sections, and light emphasis on important terms.',
      },
      { signal: input.signal },
    );
    return {
      audio: Buffer.from(await response.arrayBuffer()),
      provider: 'openai',
      apiVersion: 'v1',
      model: this.policy.ttsModel,
      voice: this.policy.ttsVoice,
      voiceId: null,
      format: this.policy.ttsFormat,
      contentType: contentTypes[this.policy.ttsFormat],
      providerCharacterCost: null,
    };
  }
}
