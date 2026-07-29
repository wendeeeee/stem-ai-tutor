import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TutorRunMetrics } from '../contracts/tutor-run-state';
import { HarnessError } from './harness-error';

export interface HarnessPolicy {
  agentTimeoutMs: number;
  toolTimeoutMs: number;
  maxAgentCalls: number;
  maxAgentRetries: number;
  maxToolRetries: number;
  maxTokens: number;
  maxEstimatedCostUsd: number;
  maxRevisions: number;
  retrievalLimit: number;
  retrievalThreshold: number;
}

@Injectable()
export class HarnessPolicyService {
  readonly values: HarnessPolicy;

  constructor(config: ConfigService) {
    this.values = {
      agentTimeoutMs: this.integer(
        config,
        'TUTOR_AGENT_TIMEOUT_MS',
        10_000,
        10,
      ),
      toolTimeoutMs: this.integer(config, 'TUTOR_TOOL_TIMEOUT_MS', 10_000, 10),
      maxAgentCalls: this.integer(config, 'TUTOR_MAX_AGENT_CALLS', 6, 1),
      maxAgentRetries: this.integer(config, 'TUTOR_MAX_AGENT_RETRIES', 1, 0),
      maxToolRetries: this.integer(config, 'TUTOR_MAX_TOOL_RETRIES', 1, 0),
      maxTokens: this.integer(config, 'TUTOR_MAX_TOKENS', 32_000, 1),
      maxEstimatedCostUsd: this.decimal(
        config,
        'TUTOR_MAX_ESTIMATED_COST_USD',
        0.1,
        0,
      ),
      maxRevisions: 1,
      retrievalLimit: this.integer(config, 'TUTOR_RETRIEVAL_LIMIT', 5, 1),
      retrievalThreshold: this.decimal(
        config,
        'TUTOR_RETRIEVAL_THRESHOLD',
        0.65,
        0,
      ),
    };

    if (this.values.retrievalLimit > 20) {
      throw new Error('TUTOR_RETRIEVAL_LIMIT must not exceed 20.');
    }
    if (this.values.retrievalThreshold > 1) {
      throw new Error('TUTOR_RETRIEVAL_THRESHOLD must be between 0 and 1.');
    }
  }

  private integer(
    config: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
  ): number {
    const value = Number(config.get<number | string>(key, fallback));
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${key} must be an integer of at least ${minimum}.`);
    }
    return value;
  }

  private decimal(
    config: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
  ): number {
    const value = Number(config.get<number | string>(key, fallback));
    if (!Number.isFinite(value) || value < minimum) {
      throw new Error(`${key} must be at least ${minimum}.`);
    }
    return value;
  }
}

export class RunBudget {
  readonly metrics: TutorRunMetrics = {
    tokens: { input: 0, output: 0, total: 0 },
    estimatedCostUsd: 0,
    latencyMs: 0,
    agentCalls: 0,
    toolCalls: 0,
    retries: 0,
    revisions: 0,
  };

  constructor(
    private readonly policy: HarnessPolicy,
    private readonly startedAt: number,
  ) {}

  beforeAgent(stage: string): void {
    if (this.metrics.agentCalls >= this.policy.maxAgentCalls) {
      throw new HarnessError(
        'AGENT_CALL_BUDGET_EXCEEDED',
        'The tutor reached its agent-call budget.',
        stage,
      );
    }
    this.metrics.agentCalls += 1;
  }

  beforeTool(): void {
    this.metrics.toolCalls += 1;
  }

  addUsage(
    tokens: { input: number; output: number; total: number },
    estimatedCostUsd: number,
    stage: string,
  ): void {
    this.metrics.tokens.input += tokens.input;
    this.metrics.tokens.output += tokens.output;
    this.metrics.tokens.total += tokens.total;
    this.metrics.estimatedCostUsd += estimatedCostUsd;

    if (this.metrics.tokens.total > this.policy.maxTokens) {
      throw new HarnessError(
        'TOKEN_BUDGET_EXCEEDED',
        'The tutor reached its token budget.',
        stage,
      );
    }
    if (this.metrics.estimatedCostUsd > this.policy.maxEstimatedCostUsd) {
      throw new HarnessError(
        'COST_BUDGET_EXCEEDED',
        'The tutor reached its estimated-cost budget.',
        stage,
      );
    }
  }

  addRetry(): void {
    this.metrics.retries += 1;
  }

  addRevision(stage: string): void {
    if (this.metrics.revisions >= this.policy.maxRevisions) {
      throw new HarnessError(
        'REVISION_LIMIT_EXCEEDED',
        'The tutor reached its answer-revision limit.',
        stage,
      );
    }
    this.metrics.revisions += 1;
  }

  complete(): void {
    this.metrics.latencyMs = Math.max(0, Date.now() - this.startedAt);
  }
}
