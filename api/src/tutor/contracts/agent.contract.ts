import { TokenMetrics } from './tutor-run-state';
import { ToolInvoker } from './tool.contract';

export interface AgentContext {
  runId: string;
  attempt: number;
  deadlineAt: Date;
  signal: AbortSignal;
  tools: ToolInvoker;
}

export interface AgentUsage {
  tokens: TokenMetrics;
  estimatedCostUsd: number;
}

export interface AgentResult<TOutput> {
  output: TOutput;
  usage: AgentUsage;
  summary: Record<string, unknown>;
}

export interface TutorAgent<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

export type AgentOutputValidator<TOutput> = (
  value: unknown,
) => value is AgentResult<TOutput>;
