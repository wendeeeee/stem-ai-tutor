import { Inject, Injectable } from '@nestjs/common';
import { ToolInvoker, ToolResult, TutorTool } from '../contracts/tool.contract';
import {
  AppendTraceRecord,
  TutorRunStore,
} from '../persistence/tutor-run-store';
import { HarnessError } from '../policies/harness-error';
import {
  HarnessPolicyService,
  RunBudget,
} from '../policies/harness-policy.service';
import { TUTOR_RUN_STORE } from '../tutor.constants';
import { CurriculumSearchTool } from './curriculum-search.tool';

export interface ToolRegistryScope {
  runId: string;
  agentName: string;
  deadlineAt: Date;
  budget: RunBudget;
  signal?: AbortSignal;
  trace(input: Omit<AppendTraceRecord, 'runId' | 'sequence'>): Promise<void>;
}

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, TutorTool<unknown, unknown>>();

  constructor(
    @Inject(CurriculumSearchTool)
    curriculumSearch: TutorTool<unknown, unknown>,
    private readonly policies: HarnessPolicyService,
    @Inject(TUTOR_RUN_STORE) private readonly store: TutorRunStore,
  ) {
    this.register(curriculumSearch);
  }

  register(tool: TutorTool<unknown, unknown>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  forScope(scope: ToolRegistryScope): ToolInvoker {
    return {
      invoke: <TInput, TOutput>(name: string, input: TInput) =>
        this.invoke<TInput, TOutput>(name, input, scope),
    };
  }

  private async invoke<TInput, TOutput>(
    name: string,
    input: TInput,
    scope: ToolRegistryScope,
  ): Promise<ToolResult<TOutput>> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new HarnessError(
        'UNKNOWN_TOOL',
        `The requested tool is not registered: ${name}.`,
        'tool',
      );
    }
    if (!tool.validateInput(input)) {
      throw new HarnessError(
        'INVALID_TOOL_INPUT',
        `Tool ${name} received invalid structured input.`,
        'tool',
      );
    }

    let lastError: HarnessError | null = null;
    for (
      let attempt = 0;
      attempt <= this.policies.values.maxToolRetries;
      attempt += 1
    ) {
      if (scope.signal?.aborted) {
        throw new HarnessError(
          'CLIENT_DISCONNECTED',
          'The tutor run was interrupted before completion.',
          'tool',
        );
      }
      scope.budget.beforeTool();
      if (attempt > 0) scope.budget.addRetry();
      const started = Date.now();
      const invocation = await this.store.startTool({
        runId: scope.runId,
        agentName: scope.agentName,
        toolName: name,
        inputSummary: this.inputSummary(input),
        retryCount: attempt,
      });
      await scope.trace({
        type: 'tool.started',
        stage: 'tool',
        status: 'started',
        agentName: scope.agentName,
        toolName: name,
        summary: { invocationId: invocation.invocationId },
        retryCount: attempt,
      });

      const controller = new AbortController();
      const abort = (): void => controller.abort();
      scope.signal?.addEventListener('abort', abort, { once: true });
      let observedUsage: ToolResult<unknown>['usage'] | null = null;
      let observedSummary: Record<string, unknown> | null = null;
      try {
        const result = await this.withTimeout(
          tool.execute(input, {
            runId: scope.runId,
            agentName: scope.agentName,
            attempt,
            deadlineAt: scope.deadlineAt,
            signal: controller.signal,
          }),
          Math.min(
            this.policies.values.toolTimeoutMs,
            Math.max(1, scope.deadlineAt.getTime() - Date.now()),
          ),
          controller,
          new HarnessError(
            'TOOL_TIMEOUT',
            `Tool ${name} exceeded its timeout.`,
            'tool',
            true,
          ),
        );
        if (!tool.validateResult(result)) {
          throw new HarnessError(
            'INVALID_TOOL_OUTPUT',
            `Tool ${name} returned malformed structured output.`,
            'tool',
          );
        }

        observedUsage = result.usage;
        observedSummary = result.summary;

        scope.budget.addUsage(
          result.usage.tokens,
          result.usage.estimatedCostUsd,
          'tool',
        );
        const durationMs = Date.now() - started;
        await this.store.finishTool(invocation.invocationId, {
          status: 'completed',
          durationMs,
          tokenCount: result.usage.tokens.total,
          estimatedCostUsd: result.usage.estimatedCostUsd,
          resultSummary: result.summary,
          errorCode: null,
          errorMessage: null,
          completedAt: new Date(),
        });
        await scope.trace({
          type: 'tool.completed',
          stage: 'tool',
          status: 'completed',
          agentName: scope.agentName,
          toolName: name,
          summary: result.summary,
          latencyMs: durationMs,
          tokenCount: result.usage.tokens.total,
          estimatedCostUsd: result.usage.estimatedCostUsd,
          retryCount: attempt,
        });
        return result as ToolResult<TOutput>;
      } catch (error: unknown) {
        const failure = scope.signal?.aborted
          ? new HarnessError(
              'CLIENT_DISCONNECTED',
              'The tutor run was interrupted before completion.',
              'tool',
            )
          : error instanceof HarnessError
            ? error
            : new HarnessError(
                'TOOL_EXECUTION_FAILED',
                `Tool ${name} failed safely.`,
                'tool',
                true,
              );
        lastError = failure;
        const durationMs = Date.now() - started;
        await this.store.finishTool(invocation.invocationId, {
          status: 'failed',
          durationMs,
          tokenCount: observedUsage?.tokens.total ?? 0,
          estimatedCostUsd: observedUsage?.estimatedCostUsd ?? 0,
          resultSummary: observedSummary,
          errorCode: failure.code,
          errorMessage: failure.safeMessage,
          completedAt: new Date(),
        });
        await scope.trace({
          type: 'tool.failed',
          stage: 'tool',
          status: 'failed',
          agentName: scope.agentName,
          toolName: name,
          summary: {},
          latencyMs: durationMs,
          tokenCount: observedUsage?.tokens.total ?? 0,
          estimatedCostUsd: observedUsage?.estimatedCostUsd ?? 0,
          retryCount: attempt,
          errorCode: failure.code,
          errorMessage: failure.safeMessage,
        });
        if (!failure.retryable) break;
      } finally {
        scope.signal?.removeEventListener('abort', abort);
      }
    }

    throw (
      lastError ??
      new HarnessError('TOOL_FAILED', `Tool ${name} failed safely.`, 'tool')
    );
  }

  private inputSummary(input: unknown): Record<string, unknown> {
    if (typeof input !== 'object' || input === null) return {};
    const value = input as Record<string, unknown>;
    return {
      queryCharacters:
        typeof value.query === 'string' ? value.query.length : undefined,
      limit: value.limit,
      threshold: value.threshold,
      subject: value.subject,
      schoolLevel: value.schoolLevel,
    };
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    controller: AbortController,
    timeoutError: HarnessError,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(timeoutError);
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
