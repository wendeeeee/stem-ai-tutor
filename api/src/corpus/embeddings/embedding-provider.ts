export interface EmbeddingBatchResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  inputTokens: number;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<EmbeddingBatchResult>;
}
