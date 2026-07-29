import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from '../contracts/voice.contracts';
import { VoicePolicyService } from '../policies/voice-policy.service';

@Injectable()
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly policy: VoicePolicyService,
  ) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!this.apiKey) throw new Error('TRANSCRIPTION_NOT_CONFIGURED');
    const client = new OpenAI({
      apiKey: this.apiKey,
      timeout: this.policy.asrTimeoutMs,
      maxRetries: 0,
    });
    const file = await toFile(input.audio, input.filename, {
      type: input.mimeType,
    });
    const response = await client.audio.transcriptions.create(
      {
        file,
        model: this.policy.asrModel,
        language: input.language,
        response_format: 'json',
      },
      { signal: input.signal },
    );
    return { transcript: response.text, model: this.policy.asrModel };
  }
}
