import { Inject, Injectable } from '@nestjs/common';
import {
  AgentOutputValidator,
  AgentResult,
  TutorAgent,
} from '../contracts/agent.contract';
import {
  GroundingVerifierInput,
  GroundingVerifierOutput,
  QueryTransformerAgentInput,
  QueryTransformerAgentOutput,
  RetrievalAgentInput,
  RetrievalAgentOutput,
  TutorAgentInput,
  TutorAgentOutput,
} from '../contracts/workflow.contracts';
import {
  isAgentResult,
  isGroundingOutput,
  isQueryTransformerOutput,
  isRetrievalOutput,
  isTutorOutput,
} from '../contracts/validation';
import {
  StructuredRunError,
  TutorCitation,
  QueryTransformation,
  TutorRunMetrics,
  TutorRunProgressOptions,
  TutorRunState,
} from '../contracts/tutor-run-state';
import { CreateTutorRunDto } from '../dto/create-tutor-run.dto';
import {
  AppendTraceRecord,
  TutorRunStore,
} from '../persistence/tutor-run-store';
import { HarnessError, asHarnessError } from '../policies/harness-error';
import {
  HarnessPolicyService,
  RunBudget,
} from '../policies/harness-policy.service';
import {
  GROUNDING_VERIFIER_AGENT,
  QUERY_TRANSFORMER_AGENT,
  RETRIEVAL_AGENT,
  TUTOR_AGENT,
  TUTOR_RUN_STORE,
  TRANSLATION_PROVIDER,
} from '../tutor.constants';
import {
  ToolRegistryScope,
  ToolRegistryService,
} from '../tools/tool-registry.service';
import {
  TranslationMetadata,
  TranslationProvider,
} from '../translation/translation.contracts';
import {
  TranslationProviderError,
  translationSafeMessage,
} from '../translation/translation-provider.error';
import { stripCitationMarkers } from '../citations/citation-markers';

@Injectable()
export class TutorOrchestratorService {
  constructor(
    @Inject(TUTOR_RUN_STORE) private readonly store: TutorRunStore,
    private readonly policies: HarnessPolicyService,
    private readonly toolRegistry: ToolRegistryService,
    @Inject(QUERY_TRANSFORMER_AGENT)
    private readonly queryTransformerAgent: TutorAgent<
      QueryTransformerAgentInput,
      QueryTransformerAgentOutput
    >,
    @Inject(RETRIEVAL_AGENT)
    private readonly retrievalAgent: TutorAgent<
      RetrievalAgentInput,
      RetrievalAgentOutput
    >,
    @Inject(TUTOR_AGENT)
    private readonly tutorAgent: TutorAgent<TutorAgentInput, TutorAgentOutput>,
    @Inject(GROUNDING_VERIFIER_AGENT)
    private readonly verifierAgent: TutorAgent<
      GroundingVerifierInput,
      GroundingVerifierOutput
    >,
    @Inject(TRANSLATION_PROVIDER)
    private readonly translationProvider: TranslationProvider,
  ) {}

  async run(
    input: CreateTutorRunDto,
    options: TutorRunProgressOptions = {},
  ): Promise<TutorRunState> {
    const wallStart = Date.now();
    const outputLanguage = input.preferredLanguage ?? 'pcm';
    const budget = new RunBudget(this.policies.values, wallStart);
    const created = await this.store.createRun({
      question: input.question,
      language: input.language,
      outputLanguage,
      voiceSessionId: input.voiceSessionId ?? null,
      metrics: this.copyMetrics(budget.metrics),
    });
    let sequence = 0;
    const errors: StructuredRunError[] = [];
    const trace = async (
      event: Omit<AppendTraceRecord, 'runId' | 'sequence'>,
    ): Promise<void> => {
      const persisted = await this.store.appendTrace({
        ...event,
        runId: created.id,
        sequence: sequence++,
      });
      try {
        await options.observer?.(persisted);
      } catch {
        // Progress observers are presentation adapters and cannot change the run.
      }
    };
    const scope = (agentName: string, deadlineAt: Date): ToolRegistryScope => ({
      runId: created.id,
      agentName,
      deadlineAt,
      budget,
      trace,
      signal: options.signal,
    });

    await trace({
      type: 'run.created',
      stage: 'run',
      status: 'info',
      summary: { language: input.language, runId: created.id },
    });
    const startedAt = new Date();
    await this.store.updateRun(created.id, {
      status: 'running',
      startedAt,
    });
    await trace({
      type: 'run.started',
      stage: 'run',
      status: 'started',
      summary: {},
    });

    try {
      const transformation = await this.executeAgent(
        this.queryTransformerAgent,
        { question: input.question, language: input.language },
        isQueryTransformerOutput,
        'query-transformation',
        created.id,
        budget,
        trace,
        scope,
        options.signal,
      );
      await this.store.updateRun(created.id, {
        queryTransformation: {
          originalQuery: input.question,
          ...transformation.output,
        },
        metrics: this.copyMetrics(budget.metrics),
      });
      const queryTransformation: QueryTransformation = {
        originalQuery: input.question,
        ...transformation.output,
      };

      const retrieval = await this.executeAgent(
        this.retrievalAgent,
        {
          query: transformation.output.refinedQuery,
          language: input.language,
        },
        isRetrievalOutput,
        'retrieval',
        created.id,
        budget,
        trace,
        scope,
        options.signal,
      );
      const chunks = retrieval.output.chunks.filter(
        (chunk) =>
          chunk.accepted &&
          chunk.hybridScore >= this.policies.values.retrievalThreshold,
      );
      await this.store.updateRun(created.id, {
        retrievedChunks: chunks,
        metrics: this.copyMetrics(budget.metrics),
      });
      await trace({
        type: 'retrieval.completed',
        stage: 'retrieval',
        status: 'info',
        summary: { acceptedChunkCount: chunks.length },
      });

      if (chunks.length === 0) {
        return this.refuse(
          created.id,
          'No curriculum evidence met the retrieval threshold.',
          {
            grounded: false,
            reasons: ['Retrieval returned no sufficient curriculum evidence.'],
            checkedCitationIds: [],
            revisionRecommended: false,
            revisionGuidance: null,
            unsupportedClaims: [],
          },
          budget,
          trace,
        );
      }

      let draft = await this.executeAgent(
        this.tutorAgent,
        {
          question: input.question,
          language: input.language,
          queryTransformation,
          chunks,
        },
        isTutorOutput,
        'tutor',
        created.id,
        budget,
        trace,
        scope,
        options.signal,
      );
      draft = {
        ...draft,
        output: {
          ...draft.output,
          citations: this.enforceCitations(draft.output.citations, chunks),
        },
      };
      await this.store.updateRun(created.id, {
        draftAnswer: draft.output.answer,
        citations: draft.output.citations,
        metrics: this.copyMetrics(budget.metrics),
      });

      if (draft.output.insufficientEvidence) {
        return this.refuse(
          created.id,
          draft.output.limitation ??
            'The retrieved curriculum evidence is insufficient.',
          {
            grounded: false,
            reasons: [
              draft.output.limitation ??
                'The tutor reported insufficient curriculum evidence.',
            ],
            checkedCitationIds: draft.output.citations.map(
              (citation) => citation.chunkId,
            ),
            revisionRecommended: false,
            revisionGuidance: null,
            unsupportedClaims: [],
          },
          budget,
          trace,
        );
      }

      let verification = await this.verify(
        input,
        chunks,
        draft.output,
        created.id,
        budget,
        trace,
        scope,
        'initial',
        options.signal,
      );
      await this.store.updateRun(created.id, {
        grounding: verification.output,
        metrics: this.copyMetrics(budget.metrics),
      });

      if (
        !verification.output.grounded &&
        verification.output.revisionRecommended
      ) {
        budget.addRevision('revision');
        await trace({
          type: 'revision.started',
          stage: 'revision',
          status: 'started',
          agentName: this.tutorAgent.name,
          summary: { revision: budget.metrics.revisions },
        });
        draft = await this.executeAgent(
          this.tutorAgent,
          {
            question: input.question,
            language: input.language,
            queryTransformation,
            chunks,
            revision: {
              previousAnswer: draft.output.answer,
              verifierReasons: verification.output.reasons,
              verifierGuidance: verification.output.revisionGuidance,
              unsupportedClaims: verification.output.unsupportedClaims,
            },
          },
          isTutorOutput,
          'revision',
          created.id,
          budget,
          trace,
          scope,
          options.signal,
        );
        draft = {
          ...draft,
          output: {
            ...draft.output,
            citations: this.enforceCitations(draft.output.citations, chunks),
          },
        };
        await this.store.updateRun(created.id, {
          draftAnswer: draft.output.answer,
          citations: draft.output.citations,
          metrics: this.copyMetrics(budget.metrics),
        });
        if (draft.output.insufficientEvidence) {
          return this.refuse(
            created.id,
            draft.output.limitation ??
              'The retrieved curriculum evidence is insufficient.',
            {
              grounded: false,
              reasons: [
                draft.output.limitation ??
                  'The tutor reported insufficient curriculum evidence.',
              ],
              checkedCitationIds: draft.output.citations.map(
                (citation) => citation.chunkId,
              ),
              revisionRecommended: false,
              revisionGuidance: null,
              unsupportedClaims: [],
            },
            budget,
            trace,
          );
        }
        verification = await this.verify(
          input,
          chunks,
          draft.output,
          created.id,
          budget,
          trace,
          scope,
          'revision',
          options.signal,
        );
        await this.store.updateRun(created.id, {
          grounding: verification.output,
          metrics: this.copyMetrics(budget.metrics),
        });
      }

      if (!verification.output.grounded) {
        return this.refuse(
          created.id,
          budget.metrics.revisions > 0
            ? 'The answer could not be grounded after one controlled revision.'
            : 'The answer could not be grounded in the retrieved curriculum evidence.',
          verification.output,
          budget,
          trace,
        );
      }

      const translationStarted = Date.now();
      await trace({
        type: 'translation.started',
        stage: 'translation',
        status: 'started',
        agentName: 'gemini-translator',
        summary: {
          sourceLanguage: 'en',
          targetLanguage: outputLanguage,
        },
      });
      let translated;
      const studentAnswer = stripCitationMarkers(
        draft.output.answer,
        draft.output.citations.map((citation) => citation.chunkId),
      );
      try {
        translated = await this.translationProvider.translate({
          text: studentAnswer,
          targetLanguage: outputLanguage,
          signal: options.signal,
        });
      } catch (error: unknown) {
        const failure =
          error instanceof TranslationProviderError
            ? new HarnessError(
                error.code,
                translationSafeMessage(error.code),
                'translation',
                error.retryable,
              )
            : new HarnessError(
                'TRANSLATION_PROVIDER_FAILED',
                'The grounded answer could not be translated safely.',
                'translation',
                true,
              );
        await trace({
          type: 'translation.failed',
          stage: 'translation',
          status: 'failed',
          agentName: 'gemini-translator',
          summary: {
            targetLanguage: outputLanguage,
          },
          latencyMs: Date.now() - translationStarted,
          errorCode: failure.code,
          errorMessage: failure.safeMessage,
        });
        throw failure;
      }
      budget.addUsage(
        {
          input: translated.inputTokens,
          output: translated.outputTokens,
          total: translated.inputTokens + translated.outputTokens,
        },
        translated.estimatedCostUsd,
        'translation',
      );
      const translationMetadata: TranslationMetadata = {
        provider: translated.provider,
        model: translated.model,
        sourceLanguage: translated.sourceLanguage,
        targetLanguage: translated.targetLanguage,
        inputTokens: translated.inputTokens,
        outputTokens: translated.outputTokens,
        estimatedCostUsd: translated.estimatedCostUsd,
        inputCharacters: studentAnswer.length,
        outputCharacters: translated.translatedText.length,
        latencyMs: Date.now() - translationStarted,
      };
      await this.store.updateRun(created.id, {
        translatedAnswer: translated.translatedText,
        translationMetadata,
        metrics: this.copyMetrics(budget.metrics),
      });
      await trace({
        type: 'translation.completed',
        stage: 'translation',
        status: 'completed',
        agentName: 'gemini-translator',
        summary: {
          provider: translated.provider,
          model: translated.model,
          targetLanguage: translated.targetLanguage,
          inputCharacters: translationMetadata.inputCharacters,
          outputCharacters: translationMetadata.outputCharacters,
        },
        latencyMs: translationMetadata.latencyMs,
        tokenCount: translated.inputTokens + translated.outputTokens,
        estimatedCostUsd: translated.estimatedCostUsd,
      });

      budget.complete();
      const completedAt = new Date();
      await this.store.updateRun(created.id, {
        status: 'completed',
        draftAnswer: draft.output.answer,
        finalAnswer: draft.output.answer,
        translatedAnswer: translated.translatedText,
        translationMetadata,
        citations: draft.output.citations,
        grounding: verification.output,
        refused: false,
        refusalReason: null,
        metrics: this.copyMetrics(budget.metrics),
        completedAt,
      });
      await trace({
        type: 'run.completed',
        stage: 'run',
        status: 'completed',
        summary: {
          grounded: true,
          citationCount: draft.output.citations.length,
          outputLanguage,
        },
        latencyMs: budget.metrics.latencyMs,
        tokenCount: budget.metrics.tokens.total,
        estimatedCostUsd: budget.metrics.estimatedCostUsd,
      });
    } catch (error: unknown) {
      const failure = asHarnessError(error, 'run');
      budget.complete();
      const structured: StructuredRunError = {
        code: failure.code,
        stage: failure.stage,
        safeMessage: failure.safeMessage,
        retryable: failure.retryable,
        occurredAt: new Date(),
      };
      errors.push(structured);
      await this.store.updateRun(created.id, {
        status: 'failed',
        finalAnswer: null,
        translatedAnswer: null,
        translationMetadata: null,
        refused: true,
        refusalReason: failure.safeMessage,
        errors,
        metrics: this.copyMetrics(budget.metrics),
        completedAt: new Date(),
      });
      await trace({
        type: 'run.failed',
        stage: failure.stage,
        status: 'failed',
        summary: {},
        latencyMs: budget.metrics.latencyMs,
        tokenCount: budget.metrics.tokens.total,
        estimatedCostUsd: budget.metrics.estimatedCostUsd,
        errorCode: failure.code,
        errorMessage: failure.safeMessage,
      });
    }

    return this.requiredRun(created.id);
  }

  private verify(
    input: CreateTutorRunDto,
    chunks: RetrievalAgentOutput['chunks'],
    draft: TutorAgentOutput,
    runId: string,
    budget: RunBudget,
    trace: (
      event: Omit<AppendTraceRecord, 'runId' | 'sequence'>,
    ) => Promise<void>,
    scope: (agentName: string, deadlineAt: Date) => ToolRegistryScope,
    attempt: 'initial' | 'revision',
    signal?: AbortSignal,
  ): Promise<AgentResult<GroundingVerifierOutput>> {
    return this.executeAgent(
      this.verifierAgent,
      {
        question: input.question,
        answer: draft.answer,
        citations: draft.citations,
        chunks,
        attempt,
        revisionAvailable: attempt === 'initial',
      },
      (output: unknown): output is GroundingVerifierOutput =>
        isGroundingOutput(output) &&
        this.verificationCheckedCanonicalCitations(output, draft.citations),
      'verification',
      runId,
      budget,
      trace,
      scope,
      signal,
    );
  }

  private verificationCheckedCanonicalCitations(
    output: GroundingVerifierOutput,
    citations: TutorCitation[],
  ): boolean {
    const expected = new Set(citations.map((citation) => citation.chunkId));
    const checked = new Set(output.checkedCitationIds);
    return (
      checked.size === output.checkedCitationIds.length &&
      checked.size === expected.size &&
      [...expected].every((id) => checked.has(id))
    );
  }

  private async executeAgent<TInput, TOutput>(
    agent: TutorAgent<TInput, TOutput>,
    input: TInput,
    outputValidator: (output: unknown) => output is TOutput,
    stage: string,
    runId: string,
    budget: RunBudget,
    trace: (
      event: Omit<AppendTraceRecord, 'runId' | 'sequence'>,
    ) => Promise<void>,
    scope: (agentName: string, deadlineAt: Date) => ToolRegistryScope,
    signal?: AbortSignal,
  ): Promise<AgentResult<TOutput>> {
    const validator: AgentOutputValidator<TOutput> = (value) =>
      isAgentResult(value, outputValidator);
    let lastError: HarnessError | null = null;

    for (
      let attempt = 0;
      attempt <= this.policies.values.maxAgentRetries;
      attempt += 1
    ) {
      this.throwIfAborted(signal, stage);
      budget.beforeAgent(stage);
      if (attempt > 0) budget.addRetry();
      const started = Date.now();
      const deadlineAt = new Date(
        Date.now() + this.policies.values.agentTimeoutMs,
      );
      await trace({
        type: 'agent.started',
        stage,
        status: 'started',
        agentName: agent.name,
        summary: { attempt },
        retryCount: attempt,
      });
      const controller = new AbortController();
      const abort = (): void => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let observedUsage: AgentResult<TOutput>['usage'] | null = null;

      try {
        const result = await this.withTimeout(
          agent.execute(input, {
            runId,
            attempt,
            deadlineAt,
            signal: controller.signal,
            tools: this.toolRegistry.forScope(scope(agent.name, deadlineAt)),
          }),
          Math.max(1, deadlineAt.getTime() - Date.now()),
          controller,
          new HarnessError(
            'AGENT_TIMEOUT',
            `Agent ${agent.name} exceeded its timeout.`,
            stage,
            true,
          ),
        );
        if (!validator(result)) {
          throw new HarnessError(
            'INVALID_AGENT_OUTPUT',
            `Agent ${agent.name} returned malformed structured output.`,
            stage,
          );
        }
        observedUsage = result.usage;
        budget.addUsage(
          result.usage.tokens,
          result.usage.estimatedCostUsd,
          stage,
        );
        await trace({
          type: 'agent.completed',
          stage,
          status: 'completed',
          agentName: agent.name,
          summary: result.summary,
          latencyMs: Date.now() - started,
          tokenCount: result.usage.tokens.total,
          estimatedCostUsd: result.usage.estimatedCostUsd,
          retryCount: attempt,
        });
        return result;
      } catch (error: unknown) {
        const failure = signal?.aborted
          ? new HarnessError(
              'CLIENT_DISCONNECTED',
              'The tutor run was interrupted before completion.',
              stage,
              false,
            )
          : error instanceof HarnessError
            ? error
            : new HarnessError(
                'AGENT_EXECUTION_FAILED',
                `Agent ${agent.name} failed safely.`,
                stage,
                true,
              );
        lastError = failure;
        await trace({
          type: 'agent.failed',
          stage,
          status: 'failed',
          agentName: agent.name,
          summary: {},
          latencyMs: Date.now() - started,
          tokenCount: observedUsage?.tokens.total ?? 0,
          estimatedCostUsd: observedUsage?.estimatedCostUsd ?? 0,
          retryCount: attempt,
          errorCode: failure.code,
          errorMessage: failure.safeMessage,
        });
        if (!failure.retryable) break;
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    }

    throw (
      lastError ??
      new HarnessError('AGENT_FAILED', 'An agent failed safely.', stage)
    );
  }

  private enforceCitations(
    citations: TutorCitation[],
    chunks: RetrievalAgentOutput['chunks'],
  ): TutorCitation[] {
    const evidence = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
    return citations.map((citation) => {
      const chunk = evidence.get(citation.chunkId);
      if (!chunk) {
        throw new HarnessError(
          'UNKNOWN_CITATION',
          'The answer cited evidence that was not retrieved for this run.',
          'citation-policy',
        );
      }
      return {
        chunkId: chunk.chunkId,
        sourceTitle: chunk.document.sourceTitle,
        sourceLocator: chunk.locator.sourceLocator,
      };
    });
  }

  private async refuse(
    runId: string,
    reason: string,
    grounding: GroundingVerifierOutput,
    budget: RunBudget,
    trace: (
      event: Omit<AppendTraceRecord, 'runId' | 'sequence'>,
    ) => Promise<void>,
  ): Promise<TutorRunState> {
    budget.complete();
    await this.store.updateRun(runId, {
      status: 'refused',
      finalAnswer: null,
      translatedAnswer: null,
      translationMetadata: null,
      grounding,
      refused: true,
      refusalReason: reason,
      metrics: this.copyMetrics(budget.metrics),
      completedAt: new Date(),
    });
    await trace({
      type: 'run.refused',
      stage: 'run',
      status: 'completed',
      summary: { reason },
      latencyMs: budget.metrics.latencyMs,
      tokenCount: budget.metrics.tokens.total,
      estimatedCostUsd: budget.metrics.estimatedCostUsd,
    });
    return this.requiredRun(runId);
  }

  private async requiredRun(runId: string): Promise<TutorRunState> {
    const state = await this.store.getRun(runId);
    if (!state) throw new Error(`Tutor run ${runId} was not persisted.`);
    return state;
  }

  private copyMetrics(metrics: TutorRunMetrics): TutorRunMetrics {
    return {
      ...metrics,
      tokens: { ...metrics.tokens },
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

  private throwIfAborted(signal: AbortSignal | undefined, stage: string): void {
    if (signal?.aborted) {
      throw new HarnessError(
        'CLIENT_DISCONNECTED',
        'The tutor run was interrupted before completion.',
        stage,
      );
    }
  }
}
