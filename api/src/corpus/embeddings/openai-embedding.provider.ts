import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CORPUS_VECTOR_DIMENSIONS } from '../corpus.constants';
import { EmbeddingBatchResult, EmbeddingProvider } from './embedding-provider';

@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly dimensions: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY');
    this.model = config.get<string>(
      'EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
    this.dimensions = config.get<number>(
      'EMBEDDING_DIMENSIONS',
      CORPUS_VECTOR_DIMENSIONS,
    );

    if (this.dimensions !== CORPUS_VECTOR_DIMENSIONS) {
      throw new Error(
        `EMBEDDING_DIMENSIONS must be ${CORPUS_VECTOR_DIMENSIONS} to match the corpus_chunks vector column.`,
      );
    }
  }

  async embed(texts: string[]): Promise<EmbeddingBatchResult> {
    if (!this.apiKey) {
      throw new Error(
        'OPENAI_API_KEY is required before corpus chunks can be embedded.',
      );
    }

    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.model,
        dimensions: this.dimensions,
        inputTokens: 0,
      };
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const response = await client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
      encoding_format: 'float',
    });
    const embeddings = [...response.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    if (
      embeddings.length !== texts.length ||
      embeddings.some((embedding) => embedding.length !== this.dimensions)
    ) {
      throw new Error(
        'The embedding provider returned an unexpected vector shape.',
      );
    }

    return {
      embeddings,
      model: response.model,
      dimensions: this.dimensions,
      inputTokens: response.usage.total_tokens,
    };
  }
}
