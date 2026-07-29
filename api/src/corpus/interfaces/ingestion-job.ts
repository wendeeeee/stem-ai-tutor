export interface IngestionJobData {
  documentId: string;
  ingestionId: string;
}

export interface IngestionJobResult {
  documentId: string;
  ingestionId: string;
  pageCount: number;
  chunkCount: number;
  embeddingTokens: number;
}
