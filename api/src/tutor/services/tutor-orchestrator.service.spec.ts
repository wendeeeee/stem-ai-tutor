import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DeterministicRetrievalAgent } from '../agents/deterministic-retrieval.agent';
import { DeterministicTutorAgent } from '../agents/deterministic-tutor.agent';
import { TutorAgent } from '../contracts/agent.contract';
import {
  ToolExecutionContext,
  ToolResult,
  TutorTool,
} from '../contracts/tool.contract';
import {
  CurriculumChunk,
  ToolUsageMetric,
  TraceEvent,
  TutorRunState,
} from '../contracts/tutor-run-state';
import {
  CurriculumSearchInput,
  CurriculumSearchOutput,
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
  AppendTraceRecord,
  CreateTutorRunRecord,
  FinishToolRecord,
  StartToolRecord,
  TutorRunPatch,
  TutorRunStore,
} from '../persistence/tutor-run-store';
import { HarnessPolicyService } from '../policies/harness-policy.service';
import {
  TranslationInput,
  TranslationProvider,
} from '../translation/translation.contracts';
import { CURRICULUM_SEARCH_TOOL } from '../tutor.constants';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { TutorOrchestratorService } from './tutor-orchestrator.service';

const chunk: CurriculumChunk = {
  chunkId: 'curriculum-chunk-1',
  content:
    'A physical change alters the form of a substance without producing a new substance.',
  topic: { id: 'topic-1', label: 'Physical changes' },
  locator: { pageStart: 12, pageEnd: 12, sourceLocator: 'page 12' },
  document: {
    id: 'document-1',
    sourceTitle: 'Basic Science Text',
    sourceAuthor: 'Test Author',
    sourcePublisher: 'Test Publisher',
    sourceUrl: null,
    sourceLicence: 'Test fixture',
    subject: 'Basic Science',
    schoolLevel: 'SS1',
    curriculum: 'NERDC',
  },
  similarity: 0.91,
  semanticSimilarity: 0.91,
  lexicalSimilarity: 1,
  hybridScore: 1,
  matchedBy: ['semantic', 'lexical'],
  accepted: true,
};

const zeroUsage = {
  tokens: { input: 0, output: 0, total: 0 },
  estimatedCostUsd: 0,
};

class MemoryTutorRunStore implements TutorRunStore {
  state: TutorRunState | null = null;

  createRun(input: CreateTutorRunRecord) {
    const now = new Date();
    const runId = randomUUID();
    this.state = {
      runId,
      voiceSessionId: input.voiceSessionId ?? null,
      status: 'created',
      question: input.question,
      language: input.language,
      outputLanguage: input.outputLanguage,
      queryTransformation: null,
      retrievedChunks: [],
      draftAnswer: null,
      finalAnswer: null,
      translatedAnswer: null,
      translation: null,
      citations: [],
      grounding: null,
      refusal: { refused: false, reason: null },
      metrics: input.metrics,
      voiceMetrics: null,
      toolUsage: [],
      trace: [],
      errors: [],
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };
    return Promise.resolve({ id: runId, createdAt: now });
  }

  updateRun(_runId: string, patch: TutorRunPatch): Promise<void> {
    if (!this.state) throw new Error('Run missing');
    const { refused, refusalReason, translationMetadata, ...values } = patch;
    this.state = {
      ...this.state,
      ...values,
      translation:
        translationMetadata === undefined
          ? this.state.translation
          : translationMetadata,
      refusal: {
        refused: refused ?? this.state.refusal.refused,
        reason:
          refusalReason === undefined
            ? this.state.refusal.reason
            : refusalReason,
      },
    };
    return Promise.resolve();
  }

  appendTrace(input: AppendTraceRecord): Promise<TraceEvent> {
    if (!this.state) throw new Error('Run missing');
    const event: TraceEvent = {
      id: randomUUID(),
      sequence: input.sequence,
      type: input.type,
      stage: input.stage,
      status: input.status,
      agentName: input.agentName ?? null,
      toolName: input.toolName ?? null,
      summary: input.summary ?? {},
      latencyMs: input.latencyMs ?? null,
      tokenCount: input.tokenCount ?? 0,
      estimatedCostUsd: input.estimatedCostUsd ?? 0,
      retryCount: input.retryCount ?? 0,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: new Date(),
    };
    this.state.trace.push(event);
    return Promise.resolve(event);
  }

  startTool(input: StartToolRecord): Promise<ToolUsageMetric> {
    if (!this.state) throw new Error('Run missing');
    const metric: ToolUsageMetric = {
      invocationId: randomUUID(),
      agentName: input.agentName,
      toolName: input.toolName,
      status: 'running',
      durationMs: null,
      tokenCount: 0,
      estimatedCostUsd: 0,
      retryCount: input.retryCount,
      resultSummary: null,
      errorCode: null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.state.toolUsage.push(metric);
    return Promise.resolve(metric);
  }

  finishTool(invocationId: string, patch: FinishToolRecord): Promise<void> {
    if (!this.state) throw new Error('Run missing');
    const metric = this.state.toolUsage.find(
      (item) => item.invocationId === invocationId,
    );
    if (!metric) throw new Error('Invocation missing');
    Object.assign(metric, {
      status: patch.status,
      durationMs: patch.durationMs,
      tokenCount: patch.tokenCount,
      estimatedCostUsd: patch.estimatedCostUsd,
      resultSummary: patch.resultSummary,
      errorCode: patch.errorCode,
      completedAt: patch.completedAt,
    });
    return Promise.resolve();
  }

  getRun(runId: string): Promise<TutorRunState | null> {
    return Promise.resolve(this.state?.runId === runId ? this.state : null);
  }
}

class FakeCurriculumTool implements TutorTool<
  CurriculumSearchInput,
  CurriculumSearchOutput
> {
  readonly name = CURRICULUM_SEARCH_TOOL;

  constructor(
    private readonly action: (
      input: CurriculumSearchInput,
      context: ToolExecutionContext,
    ) => Promise<ToolResult<CurriculumSearchOutput>>,
  ) {}

  validateInput(value: unknown): value is CurriculumSearchInput {
    return typeof value === 'object' && value !== null;
  }

  validateResult(value: unknown): value is ToolResult<CurriculumSearchOutput> {
    if (typeof value !== 'object' || value === null) return false;
    const result = value as ToolResult<CurriculumSearchOutput>;
    return Array.isArray(result.output?.chunks) && Boolean(result.usage);
  }

  execute(
    input: CurriculumSearchInput,
    context: ToolExecutionContext,
  ): Promise<ToolResult<CurriculumSearchOutput>> {
    return this.action(input, context);
  }
}

class DeterministicQueryTransformer implements TutorAgent<
  QueryTransformerAgentInput,
  QueryTransformerAgentOutput
> {
  readonly name = 'query-transformer';

  execute(input: QueryTransformerAgentInput) {
    return Promise.resolve({
      output: {
        refinedQuery: input.question,
        intent: 'define_concept' as const,
        concepts: ['physical change'],
        corrections: [],
        model: 'deterministic-test',
      },
      usage: zeroUsage,
      summary: { changed: false },
    });
  }
}

class SequenceVerifier implements TutorAgent<
  GroundingVerifierInput,
  GroundingVerifierOutput
> {
  readonly name = 'grounding-verifier';
  calls = 0;

  constructor(private readonly decisions: boolean[]) {}

  execute(input: GroundingVerifierInput) {
    const grounded = this.decisions[this.calls++] ?? false;
    return Promise.resolve({
      output: {
        grounded,
        reasons: grounded ? [] : ['The answer needs revision.'],
        checkedCitationIds: input.citations.map((item) => item.chunkId),
        revisionRecommended: !grounded && input.revisionAvailable,
        revisionGuidance:
          !grounded && input.revisionAvailable
            ? 'Use only the supplied curriculum evidence.'
            : null,
        unsupportedClaims: grounded ? [] : ['Unsupported test claim.'],
      },
      usage: zeroUsage,
      summary: { grounded },
    });
  }
}

interface HarnessOverrides {
  chunks?: CurriculumChunk[];
  toolAction?: (
    input: CurriculumSearchInput,
    context: ToolExecutionContext,
  ) => Promise<ToolResult<CurriculumSearchOutput>>;
  queryTransformerAgent?: TutorAgent<
    QueryTransformerAgentInput,
    QueryTransformerAgentOutput
  >;
  retrievalAgent?: TutorAgent<RetrievalAgentInput, RetrievalAgentOutput>;
  tutorAgent?: TutorAgent<TutorAgentInput, TutorAgentOutput>;
  verifierAgent?: TutorAgent<GroundingVerifierInput, GroundingVerifierOutput>;
  config?: Record<string, number>;
}

function createHarness(overrides: HarnessOverrides = {}) {
  const configValues: Record<string, number> = {
    TUTOR_AGENT_TIMEOUT_MS: 100,
    TUTOR_TOOL_TIMEOUT_MS: 100,
    TUTOR_MAX_AGENT_CALLS: 6,
    TUTOR_MAX_AGENT_RETRIES: 0,
    TUTOR_MAX_TOOL_RETRIES: 0,
    TUTOR_MAX_TOKENS: 10_000,
    TUTOR_MAX_ESTIMATED_COST_USD: 1,
    TUTOR_RETRIEVAL_LIMIT: 5,
    TUTOR_RETRIEVAL_THRESHOLD: 0.65,
    ...overrides.config,
  };
  const config = {
    get: jest.fn((key: string, fallback: number) =>
      key in configValues ? configValues[key] : fallback,
    ),
  } as unknown as ConfigService;
  const policies = new HarnessPolicyService(config);
  const store = new MemoryTutorRunStore();
  const candidates = overrides.chunks ?? [chunk];
  const tool = new FakeCurriculumTool(
    overrides.toolAction ??
      (() =>
        Promise.resolve({
          output: { chunks: candidates },
          usage: zeroUsage,
          summary: {
            candidateCount: candidates.length,
            acceptedCount: candidates.filter((item) => item.accepted).length,
            threshold: policies.values.retrievalThreshold,
            topCandidate: candidates[0]
              ? {
                  chunkId: candidates[0].chunkId,
                  semanticSimilarity: candidates[0].semanticSimilarity,
                  lexicalSimilarity: candidates[0].lexicalSimilarity,
                  hybridScore: candidates[0].hybridScore,
                  accepted: candidates[0].accepted,
                }
              : null,
          },
        })),
  );
  const registry = new ToolRegistryService(tool, policies, store);
  const retrieval =
    overrides.retrievalAgent ?? new DeterministicRetrievalAgent(policies);
  const tutor = overrides.tutorAgent ?? new DeterministicTutorAgent();
  const verifier = overrides.verifierAgent ?? new SequenceVerifier([true]);
  const queryTransformer =
    overrides.queryTransformerAgent ?? new DeterministicQueryTransformer();
  const translate = jest.fn((input: TranslationInput) =>
    Promise.resolve({
      translatedText: `Translated: ${input.text}`,
      provider: 'gemini' as const,
      model: 'deterministic-gemini',
      sourceLanguage: 'en' as const,
      targetLanguage: input.targetLanguage,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    }),
  );
  const translationProvider: TranslationProvider = {
    translate,
  };
  const orchestrator = new TutorOrchestratorService(
    store,
    policies,
    registry,
    queryTransformer,
    retrieval,
    tutor,
    verifier,
    translationProvider,
  );
  return { orchestrator, store, verifier, tutor, translate };
}

describe('TutorOrchestratorService', () => {
  const request = { question: 'What is a physical change?', language: 'en' };

  it('completes a grounded workflow with the retrieved citation', async () => {
    const { orchestrator } = createHarness();
    const state = await orchestrator.run(request);

    expect(state.status).toBe('completed');
    expect(state.finalAnswer).toContain('physical change');
    expect(state.translatedAnswer).toContain('Translated:');
    expect(state.outputLanguage).toBe('pcm');
    expect(state.translation).toMatchObject({
      provider: 'gemini',
      model: 'deterministic-gemini',
      sourceLanguage: 'en',
      targetLanguage: 'pcm',
    });
    expect(state.retrievedChunks).toEqual([chunk]);
    expect(state.citations).toEqual([
      {
        chunkId: chunk.chunkId,
        sourceTitle: chunk.document.sourceTitle,
        sourceLocator: chunk.locator.sourceLocator,
      },
    ]);
    expect(state.grounding?.grounded).toBe(true);
    expect(state.queryTransformation).toMatchObject({
      refinedQuery: request.question,
      model: 'deterministic-test',
    });
  });

  it('removes internal citation markers before student translation', async () => {
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: () =>
        Promise.resolve({
          output: {
            answer: `A physical change does not produce a new substance. [${chunk.chunkId}]`,
            citations: [
              {
                chunkId: chunk.chunkId,
                sourceTitle: chunk.document.sourceTitle,
                sourceLocator: chunk.locator.sourceLocator,
              },
            ],
            answerSummary: 'Physical change explanation.',
            insufficientEvidence: false,
            limitation: null,
          },
          usage: zeroUsage,
          summary: {},
        }),
    };
    const { orchestrator, translate } = createHarness({
      tutorAgent: tutor,
    });

    const state = await orchestrator.run(request);

    expect(translate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'A physical change does not produce a new substance.',
      }),
    );
    expect(state.translatedAnswer).not.toContain(chunk.chunkId);
    expect(state.citations[0]?.chunkId).toBe(chunk.chunkId);
  });

  it('passes the transformed query to retrieval and persists its intent', async () => {
    const seenQueries: string[] = [];
    const transformer: TutorAgent<
      QueryTransformerAgentInput,
      QueryTransformerAgentOutput
    > = {
      name: 'query-transformer',
      execute: () =>
        Promise.resolve({
          output: {
            refinedQuery: 'kinetic energy definition formula examples',
            intent: 'learn_concept',
            concepts: ['kinetic energy'],
            corrections: [],
            model: 'deterministic-test',
          },
          usage: zeroUsage,
          summary: { changed: true },
        }),
    };
    const { orchestrator } = createHarness({
      queryTransformerAgent: transformer,
      toolAction: (input) => {
        seenQueries.push(input.query);
        return Promise.resolve({
          output: { chunks: [chunk] },
          usage: zeroUsage,
          summary: {},
        });
      },
    });

    const state = await orchestrator.run({
      question: 'I want to learn about kinetic energy',
      language: 'en',
    });

    expect(seenQueries).toEqual(['kinetic energy definition formula examples']);
    expect(state.queryTransformation).toMatchObject({
      originalQuery: 'I want to learn about kinetic energy',
      intent: 'learn_concept',
      concepts: ['kinetic energy'],
    });
  });

  it('fails safely before retrieval on malformed transformer output', async () => {
    const transformer = {
      name: 'query-transformer',
      execute: () => Promise.resolve({ output: { refinedQuery: '' } } as never),
    } as TutorAgent<QueryTransformerAgentInput, QueryTransformerAgentOutput>;
    const toolAction = jest.fn();
    const { orchestrator } = createHarness({
      queryTransformerAgent: transformer,
      toolAction,
    });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.errors[0]?.code).toBe('INVALID_AGENT_OUTPUT');
    expect(state.queryTransformation).toBeNull();
    expect(toolAction).not.toHaveBeenCalled();
  });

  it('refuses before drafting when retrieval evidence is insufficient', async () => {
    const tutorExecute = jest.fn();
    const verifierExecute = jest.fn();
    const tutor = {
      name: 'tutor',
      execute: tutorExecute,
    } as unknown as TutorAgent<TutorAgentInput, TutorAgentOutput>;
    const verifier = {
      name: 'grounding-verifier',
      execute: verifierExecute,
    } as unknown as TutorAgent<GroundingVerifierInput, GroundingVerifierOutput>;
    const { orchestrator } = createHarness({
      chunks: [],
      tutorAgent: tutor,
      verifierAgent: verifier,
    });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('refused');
    expect(state.finalAnswer).toBeNull();
    expect(state.refusal.reason).toContain('No curriculum evidence');
    expect(tutorExecute).not.toHaveBeenCalled();
    expect(verifierExecute).not.toHaveBeenCalled();
  });

  it('refuses when a tool returns only below-threshold evidence', async () => {
    const { orchestrator } = createHarness({
      chunks: [
        {
          ...chunk,
          similarity: 0.64,
          semanticSimilarity: 0.64,
          lexicalSimilarity: 0.2,
          hybridScore: 0.64,
          accepted: false,
        },
      ],
    });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('refused');
    expect(state.retrievedChunks).toEqual([]);
    expect(state.finalAnswer).toBeNull();
    expect(state.toolUsage[0]?.resultSummary).toMatchObject({
      topCandidate: {
        chunkId: chunk.chunkId,
        hybridScore: 0.64,
        accepted: false,
      },
    });
    expect(
      state.trace.find((event) => event.type === 'tool.completed')?.summary,
    ).toMatchObject({
      topCandidate: { hybridScore: 0.64, accepted: false },
    });
    expect(
      state.trace.some(
        (event) => event.stage === 'tutor' || event.stage === 'verification',
      ),
    ).toBe(false);
  });

  it('refuses evidence not accepted by retrieval even when its score is high', async () => {
    const { orchestrator } = createHarness({
      chunks: [{ ...chunk, hybridScore: 0.99, accepted: false }],
    });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('refused');
    expect(state.retrievedChunks).toEqual([]);
    expect(state.finalAnswer).toBeNull();
    expect(
      state.trace.some(
        (event) => event.stage === 'tutor' || event.stage === 'verification',
      ),
    ).toBe(false);
  });

  it('propagates retrieved chunks into the tutor input', async () => {
    const tutor = new DeterministicTutorAgent();
    const execute = jest.spyOn(tutor, 'execute');
    const { orchestrator } = createHarness({ tutorAgent: tutor });
    await orchestrator.run(request);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ chunks: [chunk] }),
      expect.any(Object),
    );
  });

  it('rejects citations that are not in the retrieved chunk set', async () => {
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: () =>
        Promise.resolve({
          output: {
            answer: 'Unsupported answer.',
            citations: [
              {
                chunkId: 'unknown',
                sourceTitle: 'Unknown',
                sourceLocator: 'page 1',
              },
            ],
            answerSummary: 'An unsupported test answer.',
            insufficientEvidence: false,
            limitation: null,
          },
          usage: zeroUsage,
          summary: {},
        }),
    };
    const { orchestrator } = createHarness({ tutorAgent: tutor });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.finalAnswer).toBeNull();
    expect(state.errors[0]?.code).toBe('UNKNOWN_CITATION');
  });

  it('allows one answer revision after grounding failure', async () => {
    const verifier = new SequenceVerifier([false, true]);
    const tutor = new DeterministicTutorAgent();
    const execute = jest.spyOn(tutor, 'execute');
    const { orchestrator } = createHarness({
      verifierAgent: verifier,
      tutorAgent: tutor,
    });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('completed');
    expect(state.metrics.revisions).toBe(1);
    expect(verifier.calls).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      revision: {
        verifierReasons: ['The answer needs revision.'],
        verifierGuidance: 'Use only the supplied curriculum evidence.',
        unsupportedClaims: ['Unsupported test claim.'],
      },
    });
    expect(state.finalAnswer).toContain('Revised');
  });

  it('completes with multiple valid canonical citations', async () => {
    const secondChunk: CurriculumChunk = {
      ...chunk,
      chunkId: 'curriculum-chunk-2',
      content: 'Melting ice is an example of a physical change.',
      locator: { pageStart: 13, pageEnd: 13, sourceLocator: 'page 13' },
    };
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: (input) =>
        Promise.resolve({
          output: {
            answer:
              'A physical change makes no new substance; melting ice is an example.',
            citations: input.chunks.map((item) => ({
              chunkId: item.chunkId,
              sourceTitle: 'model-supplied label',
              sourceLocator: 'model-supplied locator',
            })),
            answerSummary: 'Defines physical change and gives an example.',
            insufficientEvidence: false,
            limitation: null,
          },
          usage: zeroUsage,
          summary: { citationCount: 2 },
        }),
    };
    const { orchestrator } = createHarness({
      chunks: [chunk, secondChunk],
      tutorAgent: tutor,
    });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('completed');
    expect(state.citations).toEqual([
      {
        chunkId: chunk.chunkId,
        sourceTitle: chunk.document.sourceTitle,
        sourceLocator: chunk.locator.sourceLocator,
      },
      {
        chunkId: secondChunk.chunkId,
        sourceTitle: secondChunk.document.sourceTitle,
        sourceLocator: secondChunk.locator.sourceLocator,
      },
    ]);
  });

  it('turns tutor-declared insufficient evidence into a refusal without verification', async () => {
    const verifierExecute = jest.fn();
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: () =>
        Promise.resolve({
          output: {
            answer:
              'The retrieved passage does not contain the requested formula.',
            citations: [],
            answerSummary: 'The requested formula is absent.',
            insufficientEvidence: true,
            limitation:
              'The retrieved curriculum does not contain the formula.',
          },
          usage: zeroUsage,
          summary: { insufficientEvidence: true },
        }),
    };
    const verifier = {
      name: 'grounding-verifier',
      execute: verifierExecute,
    } as unknown as TutorAgent<GroundingVerifierInput, GroundingVerifierOutput>;
    const { orchestrator } = createHarness({
      tutorAgent: tutor,
      verifierAgent: verifier,
    });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('refused');
    expect(state.finalAnswer).toBeNull();
    expect(state.refusal.reason).toContain('does not contain the formula');
    expect(verifierExecute).not.toHaveBeenCalled();
  });

  it('refuses after repeated grounding failure without a second revision', async () => {
    const verifier = new SequenceVerifier([false, false, true]);
    const { orchestrator } = createHarness({ verifierAgent: verifier });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('refused');
    expect(state.metrics.revisions).toBe(1);
    expect(verifier.calls).toBe(2);
    expect(state.finalAnswer).toBeNull();
  });

  it('terminates safely when an agent times out', async () => {
    const retrieval: TutorAgent<RetrievalAgentInput, RetrievalAgentOutput> = {
      name: 'retrieval',
      execute: () => new Promise(() => undefined),
    };
    const { orchestrator } = createHarness({
      retrievalAgent: retrieval,
      config: { TUTOR_AGENT_TIMEOUT_MS: 10 },
    });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.errors[0]?.code).toBe('AGENT_TIMEOUT');
  });

  it.each([
    ['tutor', 'tutor'],
    ['verifier', 'verification'],
  ])('fails safely when the %s provider times out', async (target, stage) => {
    const hanging = {
      name: target,
      execute: () => new Promise(() => undefined),
    };
    const { orchestrator } = createHarness({
      ...(target === 'tutor'
        ? {
            tutorAgent: hanging as TutorAgent<
              TutorAgentInput,
              TutorAgentOutput
            >,
          }
        : {
            verifierAgent: hanging as TutorAgent<
              GroundingVerifierInput,
              GroundingVerifierOutput
            >,
          }),
      config: { TUTOR_AGENT_TIMEOUT_MS: 10 },
    });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.errors[0]).toMatchObject({ code: 'AGENT_TIMEOUT', stage });
  });

  it.each(['tutor', 'verifier'])(
    'retries %s provider failure and fails with a safe summary',
    async (target) => {
      const execute = jest
        .fn()
        .mockRejectedValue(new Error('raw provider payload and secret'));
      const failing = { name: target, execute };
      const { orchestrator } = createHarness({
        ...(target === 'tutor'
          ? {
              tutorAgent: failing,
            }
          : {
              verifierAgent: failing,
            }),
        config: { TUTOR_MAX_AGENT_RETRIES: 1 },
      });

      const state = await orchestrator.run(request);
      const serialized = JSON.stringify({
        errors: state.errors,
        trace: state.trace,
      });

      expect(execute).toHaveBeenCalledTimes(2);
      expect(state.status).toBe('failed');
      expect(state.metrics.retries).toBe(1);
      expect(state.errors[0]?.code).toBe('AGENT_EXECUTION_FAILED');
      expect(serialized).not.toContain('raw provider payload');
      expect(serialized).not.toContain('secret');
    },
  );

  it.each([
    [
      'timeout',
      () => new Promise<ToolResult<CurriculumSearchOutput>>(() => undefined),
      'TOOL_TIMEOUT',
    ],
    [
      'failure',
      () => Promise.reject(new Error('provider details')),
      'TOOL_EXECUTION_FAILED',
    ],
  ])(
    'records a tool %s and terminates safely',
    async (_label, action, code) => {
      const { orchestrator } = createHarness({
        toolAction: action,
        config: { TUTOR_TOOL_TIMEOUT_MS: 10 },
      });
      const state = await orchestrator.run(request);

      expect(state.status).toBe('failed');
      expect(state.errors[0]?.code).toBe(code);
      expect(state.toolUsage[0]).toMatchObject({
        status: 'failed',
        errorCode: code,
      });
    },
  );

  it('fails safely on malformed structured agent output', async () => {
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: () => Promise.resolve({ output: 'bad shape' } as never),
    };
    const { orchestrator } = createHarness({ tutorAgent: tutor });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.errors[0]?.code).toBe('INVALID_AGENT_OUTPUT');
  });

  it('fails safely on malformed verifier structured output', async () => {
    const verifier: TutorAgent<
      GroundingVerifierInput,
      GroundingVerifierOutput
    > = {
      name: 'grounding-verifier',
      execute: () => Promise.resolve({ output: { grounded: true } } as never),
    };
    const { orchestrator } = createHarness({ verifierAgent: verifier });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.errors[0]?.code).toBe('INVALID_AGENT_OUTPUT');
    expect(state.finalAnswer).toBeNull();
  });

  it('aggregates tutor and verifier usage across one revision in trace order', async () => {
    let tutorCalls = 0;
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: () => {
        tutorCalls += 1;
        return Promise.resolve({
          output: {
            answer:
              tutorCalls === 1
                ? 'Draft physical-change answer.'
                : 'Revised physical-change answer.',
            citations: [
              {
                chunkId: chunk.chunkId,
                sourceTitle: chunk.document.sourceTitle,
                sourceLocator: chunk.locator.sourceLocator,
              },
            ],
            answerSummary: 'Physical-change answer.',
            insufficientEvidence: false,
            limitation: null,
          },
          usage: {
            tokens: { input: 10, output: 5, total: 15 },
            estimatedCostUsd: 0.001,
          },
          summary: { call: tutorCalls },
        });
      },
    };
    let verifierCalls = 0;
    const verifier: TutorAgent<
      GroundingVerifierInput,
      GroundingVerifierOutput
    > = {
      name: 'grounding-verifier',
      execute: (input) => {
        verifierCalls += 1;
        const grounded = verifierCalls === 2;
        return Promise.resolve({
          output: {
            grounded,
            reasons: grounded ? [] : ['Revise the unsupported wording.'],
            checkedCitationIds: input.citations.map((item) => item.chunkId),
            revisionRecommended: !grounded,
            revisionGuidance: grounded
              ? null
              : 'Use the exact wording supported by the chunk.',
            unsupportedClaims: grounded ? [] : ['Unsupported wording.'],
          },
          usage: {
            tokens: { input: 7, output: 3, total: 10 },
            estimatedCostUsd: 0.002,
          },
          summary: { call: verifierCalls },
        });
      },
    };
    const { orchestrator } = createHarness({
      tutorAgent: tutor,
      verifierAgent: verifier,
    });

    const state = await orchestrator.run(request);

    expect(state.status).toBe('completed');
    expect(state.metrics).toMatchObject({
      tokens: { input: 34, output: 16, total: 50 },
      estimatedCostUsd: 0.006,
      revisions: 1,
    });
    expect(state.trace.map((event) => event.type)).toEqual([
      'run.created',
      'run.started',
      'agent.started',
      'agent.completed',
      'agent.started',
      'tool.started',
      'tool.completed',
      'agent.completed',
      'retrieval.completed',
      'agent.started',
      'agent.completed',
      'agent.started',
      'agent.completed',
      'revision.started',
      'agent.started',
      'agent.completed',
      'agent.started',
      'agent.completed',
      'translation.started',
      'translation.completed',
      'run.completed',
    ]);
  });

  it.each([
    [
      'token',
      { tokens: { input: 11, output: 0, total: 11 }, estimatedCostUsd: 0 },
      { TUTOR_MAX_TOKENS: 10 },
      'TOKEN_BUDGET_EXCEEDED',
    ],
    [
      'cost',
      { tokens: { input: 0, output: 0, total: 0 }, estimatedCostUsd: 0.02 },
      { TUTOR_MAX_ESTIMATED_COST_USD: 0.01 },
      'COST_BUDGET_EXCEEDED',
    ],
  ])('enforces the %s budget', async (_label, usage, config, code) => {
    const tutor: TutorAgent<TutorAgentInput, TutorAgentOutput> = {
      name: 'tutor',
      execute: () =>
        Promise.resolve({
          output: {
            answer: 'A physical change does not produce a new substance.',
            citations: [
              {
                chunkId: chunk.chunkId,
                sourceTitle: chunk.document.sourceTitle,
                sourceLocator: chunk.locator.sourceLocator,
              },
            ],
            answerSummary: 'Physical change explanation.',
            insufficientEvidence: false,
            limitation: null,
          },
          usage,
          summary: {},
        }),
    };
    const { orchestrator } = createHarness({ tutorAgent: tutor, config });
    const state = await orchestrator.run(request);

    expect(state.status).toBe('failed');
    expect(state.errors[0]?.code).toBe(code);
  });

  it('persists trace events in strict workflow order', async () => {
    const { orchestrator } = createHarness();
    const state = await orchestrator.run(request);
    const sequences = state.trace.map((event) => event.sequence);

    expect(sequences).toEqual(sequences.map((_value, index) => index));
    expect(state.trace.map((event) => event.type)).toEqual([
      'run.created',
      'run.started',
      'agent.started',
      'agent.completed',
      'agent.started',
      'tool.started',
      'tool.completed',
      'agent.completed',
      'retrieval.completed',
      'agent.started',
      'agent.completed',
      'agent.started',
      'agent.completed',
      'translation.started',
      'translation.completed',
      'run.completed',
    ]);
  });

  it('notifies a progress observer before terminal completion', async () => {
    const { orchestrator } = createHarness();
    const observed: TraceEvent[] = [];

    const state = await orchestrator.run(request, {
      observer: (progress) => {
        observed.push(progress);
      },
    });

    expect(observed.map((progress) => progress.sequence)).toEqual(
      state.trace.map((progress) => progress.sequence),
    );
    expect(observed.at(-1)?.type).toBe('run.completed');
    expect(
      observed.findIndex((progress) => progress.type === 'agent.started'),
    ).toBeLessThan(
      observed.findIndex((progress) => progress.type === 'run.completed'),
    );
  });

  it('persists a safe failed terminal state when execution is cancelled', async () => {
    let started: (() => void) | undefined;
    const transformer: TutorAgent<
      QueryTransformerAgentInput,
      QueryTransformerAgentOutput
    > = {
      name: 'slow-transformer',
      execute: (_input, context) =>
        new Promise((_resolve, reject) => {
          started?.();
          context.signal.addEventListener(
            'abort',
            () => reject(new Error('raw disconnect')),
            { once: true },
          );
        }),
    };
    const controller = new AbortController();
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { orchestrator } = createHarness({
      queryTransformerAgent: transformer,
    });

    const pending = orchestrator.run(request, { signal: controller.signal });
    await began;
    controller.abort();
    const state = await pending;

    expect(state.status).toBe('failed');
    expect(state.finalAnswer).toBeNull();
    expect(state.errors[0]?.code).toBe('CLIENT_DISCONNECTED');
    expect(state.trace.at(-1)?.type).toBe('run.failed');
  });
});
