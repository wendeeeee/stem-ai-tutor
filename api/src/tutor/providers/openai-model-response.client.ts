import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ModelResponseClient,
  ModelResponseRequest,
  ModelResponseResult,
} from './model-response-client';

@Injectable()
export class OpenAiModelResponseClient implements ModelResponseClient {
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async create(
    request: ModelResponseRequest,
    signal: AbortSignal,
  ): Promise<ModelResponseResult> {
    if (!this.apiKey) {
      throw new Error('The OpenAI model response client is not configured.');
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const response = await client.responses.create(
      {
        model: request.model,
        store: false,
        reasoning: { effort: 'low' },
        instructions: request.instructions,
        input: request.input,
        max_output_tokens: request.maxOutputTokens,
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      },
      { signal },
    );

    const refused = response.output.some(
      (item) =>
        item.type === 'message' &&
        item.content.some((content) => content.type === 'refusal'),
    );

    return {
      outputText: response.output_text,
      model: response.model,
      status: response.status ?? 'unknown',
      refused,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
  }
}
