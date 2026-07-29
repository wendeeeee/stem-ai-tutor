export interface ModelResponseRequest {
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens: number;
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface ModelResponseResult {
  outputText: string;
  model: string;
  status: string;
  refused: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponseClient {
  isConfigured(): boolean;
  create(
    request: ModelResponseRequest,
    signal: AbortSignal,
  ): Promise<ModelResponseResult>;
}
