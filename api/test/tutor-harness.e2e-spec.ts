import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DeterministicGroundingVerifierAgent } from '../src/tutor/agents/deterministic-grounding-verifier.agent';
import { TutorAgent } from '../src/tutor/contracts/agent.contract';
import { ToolResult, TutorTool } from '../src/tutor/contracts/tool.contract';
import { CurriculumChunk } from '../src/tutor/contracts/tutor-run-state';
import {
  CurriculumSearchInput,
  CurriculumSearchOutput,
  QueryTransformerAgentInput,
  QueryTransformerAgentOutput,
  TutorAgentInput,
  TutorAgentOutput,
} from '../src/tutor/contracts/workflow.contracts';
import { CurriculumSearchTool } from '../src/tutor/tools/curriculum-search.tool';
import {
  GROUNDING_VERIFIER_AGENT,
  QUERY_TRANSFORMER_AGENT,
  REINFORCEMENT_EVALUATION_PROVIDER,
  REINFORCEMENT_QUESTION_PROVIDER,
  TUTOR_AGENT,
  TRANSLATION_PROVIDER,
} from '../src/tutor/tutor.constants';
import { TranslationProvider } from '../src/tutor/translation/translation.contracts';
import {
  ReinforcementEvaluationProvider,
  ReinforcementQuestionProvider,
} from '../src/tutor/reinforcement/reinforcement.contracts';
import { ReinforcementPolicyService } from '../src/tutor/reinforcement/reinforcement-policy.service';
import {
  SpeechProvider,
  TranscriptionProvider,
} from '../src/voice/contracts/voice.contracts';
import {
  SPEECH_PROVIDER,
  TRANSCRIPTION_PROVIDER,
} from '../src/voice/voice.constants';

const describeIntegration =
  process.env.RUN_CORPUS_INTEGRATION === 'true' ? describe : describe.skip;

const chunk: CurriculumChunk = {
  chunkId: 'integration-curriculum-chunk',
  content:
    'A physical change alters form without creating a new substance. Melting ice is an example.',
  topic: { id: null, label: 'Physical changes' },
  locator: { pageStart: 4, pageEnd: 4, sourceLocator: 'page 4' },
  document: {
    id: 'integration-document',
    sourceTitle: 'Integration Basic Science Text',
    sourceAuthor: null,
    sourcePublisher: null,
    sourceUrl: null,
    sourceLicence: 'Test fixture',
    subject: 'Basic Science',
    schoolLevel: 'SS1',
    curriculum: 'NERDC',
  },
  similarity: 0.95,
  semanticSimilarity: 0.95,
  lexicalSimilarity: 1,
  hybridScore: 1,
  matchedBy: ['semantic', 'lexical'],
  accepted: true,
};

class IntegrationCurriculumTool implements TutorTool<
  CurriculumSearchInput,
  CurriculumSearchOutput
> {
  readonly name = 'curriculum.search';

  validateInput(value: unknown): value is CurriculumSearchInput {
    return typeof value === 'object' && value !== null;
  }

  validateResult(value: unknown): value is ToolResult<CurriculumSearchOutput> {
    if (typeof value !== 'object' || value === null) return false;
    const result = value as ToolResult<CurriculumSearchOutput>;
    return Array.isArray(result.output?.chunks) && Boolean(result.usage);
  }

  execute(): Promise<ToolResult<CurriculumSearchOutput>> {
    return Promise.resolve({
      output: { chunks: [chunk] },
      usage: {
        tokens: { input: 7, output: 0, total: 7 },
        estimatedCostUsd: 0.000001,
      },
      summary: {
        candidateCount: 1,
        acceptedCount: 1,
        threshold: 0.65,
        topCandidate: {
          chunkId: chunk.chunkId,
          semanticSimilarity: chunk.semanticSimilarity,
          lexicalSimilarity: chunk.lexicalSimilarity,
          hybridScore: chunk.hybridScore,
          accepted: true,
        },
      },
    });
  }
}

class MutableTutorAgent implements TutorAgent<
  TutorAgentInput,
  TutorAgentOutput
> {
  readonly name = 'tutor';
  malformed = false;

  execute(input: TutorAgentInput) {
    if (this.malformed) {
      return Promise.resolve({ output: 'malformed' } as never);
    }
    const evidence = input.chunks[0];
    return Promise.resolve({
      output: {
        answer: `According to the curriculum: ${evidence.content}`,
        citations: [
          {
            chunkId: evidence.chunkId,
            sourceTitle: evidence.document.sourceTitle,
            sourceLocator: evidence.locator.sourceLocator,
          },
        ],
        answerSummary: 'A grounded physical-change explanation.',
        insufficientEvidence: false,
        limitation: null,
      },
      usage: {
        tokens: { input: 20, output: 12, total: 32 },
        estimatedCostUsd: 0,
      },
      summary: { citationCount: 1 },
    });
  }
}

class IntegrationQueryTransformer implements TutorAgent<
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
        model: 'deterministic-integration',
      },
      usage: {
        tokens: { input: 0, output: 0, total: 0 },
        estimatedCostUsd: 0,
      },
      summary: { changed: false },
    });
  }
}

class IntegrationTranscriptionProvider implements TranscriptionProvider {
  transcribe() {
    return Promise.resolve({
      transcript: 'What is a physical change?',
      model: 'deterministic-integration-asr',
    });
  }
}

class IntegrationSpeechProvider implements SpeechProvider {
  synthesize() {
    return Promise.resolve({
      audio: Buffer.from('deterministic speech bytes'),
      provider: 'openai' as const,
      apiVersion: 'v1',
      model: 'deterministic-integration-tts',
      voice: 'cedar',
      format: 'mp3' as const,
      contentType: 'audio/mpeg',
    });
  }
}

class IntegrationTranslationProvider implements TranslationProvider {
  translate(input: Parameters<TranslationProvider['translate']>[0]) {
    return Promise.resolve({
      translatedText: `Pidgin translation: ${input.text}`,
      provider: 'gemini' as const,
      model: 'deterministic-integration-gemini',
      sourceLanguage: 'en' as const,
      targetLanguage: input.targetLanguage,
      inputTokens: 5,
      outputTokens: 5,
      estimatedCostUsd: 0,
    });
  }
}

class IntegrationReinforcementQuestionProvider implements ReinforcementQuestionProvider {
  generate() {
    return Promise.resolve({
      items: [
        {
          prompt: 'What happens to a substance during a physical change?',
          expectedAnswer:
            'A physical change alters form without creating a new substance.',
          hint: 'Think about whether the material becomes a different substance.',
          evidenceChunkIds: [chunk.chunkId],
        },
        {
          prompt: 'Which example of a physical change was explained?',
          expectedAnswer: 'Melting ice is an example.',
          hint: 'Think about the change from solid water to liquid water.',
          evidenceChunkIds: [chunk.chunkId],
        },
      ],
      model: 'deterministic-integration-reinforcement',
      inputTokens: 10,
      outputTokens: 10,
      estimatedCostUsd: 0,
    });
  }
}

class IntegrationReinforcementEvaluationProvider implements ReinforcementEvaluationProvider {
  evaluate(input: { studentAnswer: string }) {
    const correct = input.studentAnswer
      .toLowerCase()
      .includes('without creating a new substance');
    return Promise.resolve({
      correct,
      confidence: 'high' as const,
      evaluationSummary: correct
        ? 'The key idea is present.'
        : 'The key idea is missing.',
      model: 'deterministic-integration-evaluator',
      inputTokens: 5,
      outputTokens: 5,
      estimatedCostUsd: 0,
    });
  }
}

describeIntegration('Tutor harness persistence (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;
  const runIds: string[] = [];
  const voiceSessionIds: string[] = [];
  const tutorAgent = new MutableTutorAgent();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CurriculumSearchTool)
      .useValue(new IntegrationCurriculumTool())
      .overrideProvider(QUERY_TRANSFORMER_AGENT)
      .useValue(new IntegrationQueryTransformer())
      .overrideProvider(GROUNDING_VERIFIER_AGENT)
      .useValue(new DeterministicGroundingVerifierAgent())
      .overrideProvider(TUTOR_AGENT)
      .useValue(tutorAgent)
      .overrideProvider(TRANSCRIPTION_PROVIDER)
      .useValue(new IntegrationTranscriptionProvider())
      .overrideProvider(TRANSLATION_PROVIDER)
      .useValue(new IntegrationTranslationProvider())
      .overrideProvider(SPEECH_PROVIDER)
      .useValue(new IntegrationSpeechProvider())
      .overrideProvider(REINFORCEMENT_QUESTION_PROVIDER)
      .useValue(new IntegrationReinforcementQuestionProvider())
      .overrideProvider(REINFORCEMENT_EVALUATION_PROVIDER)
      .useValue(new IntegrationReinforcementEvaluationProvider())
      .overrideProvider(ReinforcementPolicyService)
      .useValue({
        questionCount: 2,
        generationAttempts: 2,
        maxAttemptsPerQuestion: 3,
        timeoutMs: 1_000,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    server = app.getHttpServer() as Server;
  }, 30_000);

  afterAll(async () => {
    if (runIds.length > 0) {
      await dataSource.query(
        'DELETE FROM tutor_runs WHERE id = ANY($1::uuid[])',
        [runIds],
      );
    }
    if (voiceSessionIds.length > 0) {
      await dataSource.query(
        'DELETE FROM voice_sessions WHERE id = ANY($1::uuid[])',
        [voiceSessionIds],
      );
    }
    await app.close();
  });

  it('persists and retrieves a completed grounded run with traces and tools', async () => {
    tutorAgent.malformed = false;
    const created = await request(server)
      .post('/api/tutor/runs')
      .send({ question: 'What is a physical change?', language: 'en' })
      .expect(201);
    const body = created.body as unknown as TutorRunStateResponse;
    runIds.push(body.runId);

    expect(body.status).toBe('completed');
    expect(body.finalAnswer).toContain('physical change');
    expect(body.translatedAnswer).toContain('Pidgin translation');
    expect(body.outputLanguage).toBe('pcm');
    expect(body.refusal).toEqual({ refused: false, reason: null });
    expect(body.grounding?.grounded).toBe(true);
    expect(body.queryTransformation).toMatchObject({
      model: 'deterministic-integration',
      refinedQuery: 'What is a physical change?',
    });
    expect(body.trace.length).toBeGreaterThan(0);
    expect(body.toolUsage).toEqual([
      expect.objectContaining({
        toolName: 'curriculum.search',
        status: 'completed',
      }),
    ]);

    const fetched = await request(server)
      .get(`/api/tutor/runs/${body.runId}`)
      .expect(200);
    expect(fetched.body).toMatchObject({
      runId: body.runId,
      status: 'completed',
      citations: [{ chunkId: chunk.chunkId }],
    });

    const rows = await dataSource.query<
      Array<{ status: string; eventCount: string; toolCount: string }>
    >(
      `SELECT run.status,
        (SELECT COUNT(*) FROM agent_events event WHERE event.run_id = run.id) AS "eventCount",
        (SELECT COUNT(*) FROM tool_invocations tool WHERE tool.run_id = run.id) AS "toolCount"
       FROM tutor_runs run WHERE run.id = $1`,
      [body.runId],
    );
    expect(rows[0]?.status).toBe('completed');
    expect(Number(rows[0]?.eventCount)).toBeGreaterThan(0);
    expect(Number(rows[0]?.toolCount)).toBe(1);
  });

  it('persists a failed run and its safe structured error', async () => {
    tutorAgent.malformed = true;
    const created = await request(server)
      .post('/api/tutor/runs')
      .send({ question: 'What is a physical change?', language: 'en' })
      .expect(201);
    const body = created.body as unknown as TutorRunStateResponse;
    runIds.push(body.runId);

    expect(body).toMatchObject({
      status: 'failed',
      finalAnswer: null,
      refusal: { refused: true },
      errors: [{ code: 'INVALID_AGENT_OUTPUT' }],
    });

    const rows = await dataSource.query<
      Array<{ status: string; errors: Array<{ code: string }> }>
    >('SELECT status, errors FROM tutor_runs WHERE id = $1', [body.runId]);
    expect(rows[0]).toMatchObject({
      status: 'failed',
      errors: [{ code: 'INVALID_AGENT_OUTPUT' }],
    });
  });

  it('accepts browser audio, links voice metrics, and speaks only the canonical answer', async () => {
    tutorAgent.malformed = false;
    const audio = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.alloc(32, 1),
    ]);
    const transcription = await request(server)
      .post('/api/voice/transcriptions')
      .field('language', 'en')
      .field('durationMs', '2000')
      .attach('audio', audio, {
        filename: 'question.webm',
        contentType: 'audio/webm',
      })
      .expect(201);
    const transcriptionBody =
      transcription.body as unknown as TranscriptionResponse;
    const voiceSessionId = transcriptionBody.voiceSessionId;
    voiceSessionIds.push(voiceSessionId);
    expect(transcriptionBody).toMatchObject({
      transcript: 'What is a physical change?',
      language: 'en',
      model: 'deterministic-integration-asr',
      voiceSessionId,
    });

    const created = await request(server)
      .post('/api/tutor/runs')
      .send({
        question: transcriptionBody.transcript,
        language: 'en',
        voiceSessionId,
      })
      .expect(201);
    const body = created.body as unknown as TutorRunStateResponse;
    runIds.push(body.runId);
    expect(body.status).toBe('completed');
    expect(body.finalAnswer).toContain('physical change');
    expect(body.translatedAnswer).toContain('Pidgin translation');
    expect(body.voiceMetrics?.asr).toMatchObject({
      model: 'deterministic-integration-asr',
      durationMs: 2000,
    });

    const speech = await request(server)
      .post(`/api/tutor/runs/${body.runId}/speech`)
      .expect(201)
      .expect('content-type', /audio\/mpeg/);
    expect(speech.headers['x-voice-session-id']).toBe(voiceSessionId);
    expect(speech.headers['x-tts-model']).toBe('deterministic-integration-tts');

    const fetched = await request(server)
      .get(`/api/tutor/runs/${body.runId}`)
      .expect(200);
    const fetchedBody = fetched.body as unknown as TutorRunStateResponse;
    expect(fetchedBody.voiceMetrics).toMatchObject({
      voiceSessionId,
      asr: { model: 'deterministic-integration-asr' },
      tts: {
        model: 'deterministic-integration-tts',
        voice: 'cedar',
        format: 'mp3',
      },
    });
  });

  it('persists bounded reinforcement attempts with praise and non-revealing hints', async () => {
    tutorAgent.malformed = false;
    const created = await request(server)
      .post('/api/tutor/runs')
      .send({ question: 'What is a physical change?', language: 'en' })
      .expect(201);
    const run = created.body as unknown as TutorRunStateResponse;
    runIds.push(run.runId);

    const generated = await request(server)
      .post(`/api/tutor/runs/${run.runId}/reinforcement`)
      .expect(201);
    const initial = generated.body as unknown as ReinforcementResponse;
    expect(initial.questions).toHaveLength(2);
    expect(initial.questions[0]).not.toHaveProperty('expectedAnswer');

    const incorrect = await request(server)
      .post(`/api/tutor/runs/${run.runId}/reinforcement/answers`)
      .send({
        questionId: initial.activeQuestionId,
        answer: 'It changes into a completely different substance.',
      })
      .expect(201);
    const incorrectBody = incorrect.body as unknown as ReinforcementResponse;
    expect(incorrectBody.questions[0]?.attempts[0]).toMatchObject({
      correct: false,
      hint: 'Think about whether the material becomes a different substance.',
    });

    const corrected = await request(server)
      .post(`/api/tutor/runs/${run.runId}/reinforcement/answers`)
      .send({
        questionId: initial.activeQuestionId,
        answer:
          'Its form changes without creating a new substance, so it remains the same substance.',
      })
      .expect(201);
    const correctedBody = corrected.body as unknown as ReinforcementResponse;
    expect(correctedBody.questions[0]?.attempts[1]).toMatchObject({
      correct: true,
      hint: null,
      feedback: 'Well done! You used the hint and worked it out correctly.',
    });

    const fetched = await request(server)
      .get(`/api/tutor/runs/${run.runId}/reinforcement`)
      .expect(200);
    const fetchedBody = fetched.body as unknown as ReinforcementResponse;
    expect(fetchedBody.questions[0]?.attempts).toHaveLength(2);
  });
});

interface TutorRunStateResponse {
  runId: string;
  status: string;
  finalAnswer: string | null;
  translatedAnswer: string | null;
  outputLanguage: string;
  trace: unknown[];
  toolUsage: Array<{ toolName: string; status: string }>;
  refusal: { refused: boolean; reason: string | null };
  grounding: { grounded: boolean } | null;
  citations: Array<{ chunkId: string }>;
  queryTransformation: {
    refinedQuery: string;
    model: string;
  } | null;
  errors: Array<{ code: string }>;
  voiceMetrics: {
    voiceSessionId: string;
    asr: { model: string; durationMs: number } | null;
    tts: { model: string; voice: string; format: string } | null;
  } | null;
}

interface TranscriptionResponse {
  transcript: string;
  language: string;
  model: string;
  voiceSessionId: string;
}

interface ReinforcementResponse {
  activeQuestionId: string;
  questions: Array<{
    attempts: Array<{
      correct: boolean;
      feedback: string;
      hint: string | null;
    }>;
  }>;
}
