import { TokenMetrics } from './tutor-run-state';

export interface ToolExecutionContext {
  runId: string;
  agentName: string;
  attempt: number;
  deadlineAt: Date;
  signal: AbortSignal;
}

export interface ToolResult<TOutput> {
  output: TOutput;
  usage: {
    tokens: TokenMetrics;
    estimatedCostUsd: number;
  };
  summary: Record<string, unknown>;
}

export interface TutorTool<TInput, TOutput> {
  readonly name: string;
  validateInput(value: unknown): value is TInput;
  validateResult(value: unknown): value is ToolResult<TOutput>;
  execute(
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<ToolResult<TOutput>>;
}

export interface ToolInvoker {
  invoke<TInput, TOutput>(
    name: string,
    input: TInput,
  ): Promise<ToolResult<TOutput>>;
}
