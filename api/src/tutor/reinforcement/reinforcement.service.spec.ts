/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import { BadGatewayException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { VoiceSessionService } from '../../voice/services/voice-session.service';
import { SubmitReinforcementAnswerDto } from '../dto/submit-reinforcement-answer.dto';
import { TutorRun } from '../entities/tutor-run.entity';
import {
  ReinforcementEvaluationProvider,
  ReinforcementQuestionProvider,
} from './reinforcement.contracts';
import { ReinforcementAttempt } from './reinforcement-attempt.entity';
import { ReinforcementPolicyService } from './reinforcement-policy.service';
import { ReinforcementQuestionSet } from './reinforcement-question-set.entity';
import { ReinforcementService } from './reinforcement.service';

function groundedRun(): TutorRun {
  return {
    id: '055c79a0-c1db-47f2-9312-a54670b45bef',
    status: 'completed',
    question: 'What is energy?',
    language: 'en',
    finalAnswer:
      'Let us explore it together.\n\n### What is energy?\n\nEnergy is the capacity to do work.',
    citations: [
      {
        chunkId: 'chunk-1',
        sourceTitle: 'Science',
        sourceLocator: 'page 1',
      },
    ],
    retrievedChunks: [
      {
        chunkId: 'chunk-1',
        content: 'Energy is the capacity to do work.',
        topic: { id: null, label: 'Energy' },
        locator: { pageStart: 1, pageEnd: 1, sourceLocator: 'page 1' },
        document: {
          id: 'document-1',
          sourceTitle: 'Science',
          sourceAuthor: null,
          sourcePublisher: null,
          sourceUrl: null,
          sourceLicence: 'Test',
          subject: 'Science',
          schoolLevel: 'SS1',
          curriculum: 'NERDC',
        },
        similarity: 1,
        semanticSimilarity: 1,
        lexicalSimilarity: 1,
        hybridScore: 1,
        matchedBy: ['semantic', 'lexical'],
        accepted: true,
      },
    ],
    grounding: {
      grounded: true,
      reasons: ['Supported.'],
      checkedCitationIds: ['chunk-1'],
      revisionRecommended: false,
      revisionGuidance: null,
      unsupportedClaims: [],
    },
    refused: false,
  } as unknown as TutorRun;
}

function setup(
  options: {
    evidenceChunkIds?: string[];
    evaluationResults?: boolean[];
    generationFailures?: number;
    hint?: string;
  } = {},
) {
  let storedSet: ReinforcementQuestionSet | null = null;
  const storedAttempts: ReinforcementAttempt[] = [];
  const runs = {
    findOne: jest.fn(() => Promise.resolve(groundedRun())),
  } as unknown as Repository<TutorRun>;
  const sets = {
    findOne: jest.fn(() => Promise.resolve(storedSet)),
    create: jest.fn((value) => value),
    save: jest.fn((value) => {
      storedSet = {
        ...value,
        id: 'c679c81a-4f96-40dc-82b8-f55ae1dd306f',
        createdAt: new Date(),
      } as ReinforcementQuestionSet;
      return Promise.resolve(storedSet);
    }),
  } as unknown as Repository<ReinforcementQuestionSet>;
  const attempts = {
    find: jest.fn(({ where }) =>
      Promise.resolve(
        storedAttempts.filter(
          (attempt) =>
            attempt.questionSetId === where.questionSetId &&
            (where.questionId === undefined ||
              attempt.questionId === where.questionId),
        ),
      ),
    ),
    create: jest.fn((value) => value),
    save: jest.fn((value) => {
      const attempt = {
        ...value,
        id: `attempt-${storedAttempts.length + 1}`,
        createdAt: new Date(),
      } as ReinforcementAttempt;
      storedAttempts.push(attempt);
      return Promise.resolve(attempt);
    }),
  } as unknown as Repository<ReinforcementAttempt>;
  let remainingGenerationFailures = options.generationFailures ?? 0;
  const questionProvider = {
    generate: jest.fn(() => {
      if (remainingGenerationFailures > 0) {
        remainingGenerationFailures -= 1;
        return Promise.reject(new Error('INVALID_REINFORCEMENT_OUTPUT'));
      }
      return Promise.resolve({
        items: [
          {
            prompt: 'What does energy allow a system to do?',
            expectedAnswer: 'Energy is the capacity to do work.',
            hint:
              options.hint ?? 'Think about the action a system can perform.',
            evidenceChunkIds: options.evidenceChunkIds ?? ['chunk-1'],
          },
        ],
        model: 'fake-question-model',
        inputTokens: 50,
        outputTokens: 20,
        estimatedCostUsd: 0.001,
      });
    }),
  } as ReinforcementQuestionProvider;
  const outcomes = [...(options.evaluationResults ?? [true])];
  const evaluationProvider = {
    evaluate: jest.fn(() =>
      Promise.resolve({
        correct: outcomes.shift() ?? false,
        confidence: 'high' as const,
        evaluationSummary: 'Deterministic classification.',
        model: 'fake-evaluator',
        inputTokens: 20,
        outputTokens: 5,
        estimatedCostUsd: 0.0002,
      }),
    ),
  } as ReinforcementEvaluationProvider;
  const policy = {
    questionCount: 1,
    generationAttempts: 2,
    maxAttemptsPerQuestion: 3,
    timeoutMs: 1_000,
  } as ReinforcementPolicyService;
  const voiceSessions = {
    assertAvailable: jest.fn(() => Promise.resolve()),
  } as unknown as VoiceSessionService;
  return {
    service: new ReinforcementService(
      runs,
      sets,
      attempts,
      questionProvider,
      evaluationProvider,
      policy,
      voiceSessions,
    ),
    questionProvider,
    evaluationProvider,
    voiceSessions,
  };
}

describe('ReinforcementService', () => {
  it('generates an idempotent public question set from verified answer excerpts', async () => {
    const { service, questionProvider } = setup();

    const first = await service.generate(groundedRun().id);
    const second = await service.generate(groundedRun().id);

    expect(first.questions).toHaveLength(1);
    expect(first.questions[0]).toMatchObject({
      prompt: 'What does energy allow a system to do?',
      attemptsRemaining: 3,
    });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain('expectedAnswer');
    expect(questionProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('rejects generated questions with non-canonical evidence', async () => {
    const { service } = setup({ evidenceChunkIds: ['unknown'] });

    await expect(service.generate(groundedRun().id)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('replaces a hint that substantially reveals the expected answer', async () => {
    const { service } = setup({
      hint: 'Remember that energy is the capacity to do work.',
    });

    const generated = await service.generate(groundedRun().id);

    expect(JSON.stringify(generated)).not.toContain(
      'Energy is the capacity to do work',
    );
  });

  it('retries malformed generation once without creating a partial set', async () => {
    const { service, questionProvider } = setup({ generationFailures: 1 });

    const generated = await service.generate(groundedRun().id);

    expect(generated.questions).toHaveLength(1);
    expect(questionProvider.generate).toHaveBeenCalledTimes(2);
  });

  it('fails safely after the bounded generation retry is exhausted', async () => {
    const { service, questionProvider } = setup({ generationFailures: 2 });

    await expect(service.generate(groundedRun().id)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(questionProvider.generate).toHaveBeenCalledTimes(2);
  });

  it('uses application-owned praise for a correct response', async () => {
    const { service, evaluationProvider, voiceSessions } = setup({
      evaluationResults: [true],
    });
    const generated = await service.generate(groundedRun().id);
    const input: SubmitReinforcementAnswerDto = {
      questionId: generated.activeQuestionId as string,
      answer: 'It is the ability to perform work.',
      voiceSessionId: '194bdce5-8a48-49ec-99f3-82ae1460f350',
    };

    const result = await service.answer(groundedRun().id, input);

    expect(result.complete).toBe(true);
    expect(result.questions[0]?.attempts[0]).toMatchObject({
      correct: true,
      hint: null,
      feedback: 'Excellent work! You understood that idea correctly.',
    });
    expect(evaluationProvider.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAnswer: 'Energy is the capacity to do work.',
        studentAnswer: input.answer,
      }),
      expect.any(AbortSignal),
    );
    expect(voiceSessions.assertAvailable).toHaveBeenCalledWith(
      input.voiceSessionId,
    );
  });

  it('returns a pre-validated hint for an incorrect response and permits a retry', async () => {
    const { service } = setup({ evaluationResults: [false, true] });
    const generated = await service.generate(groundedRun().id);
    const questionId = generated.activeQuestionId as string;

    const incorrect = await service.answer(groundedRun().id, {
      questionId,
      answer: 'Energy makes things heavy.',
    });

    expect(incorrect.complete).toBe(false);
    expect(incorrect.questions[0]?.attempts[0]).toMatchObject({
      correct: false,
      hint: 'Think about the action a system can perform.',
    });
    expect(incorrect.questions[0]?.attemptsRemaining).toBe(2);

    const corrected = await service.answer(groundedRun().id, {
      questionId,
      answer: 'Energy means a system has the ability to do work.',
    });
    expect(corrected.questions[0]?.attempts[1]).toMatchObject({
      correct: true,
      feedback: 'Well done! You used the hint and worked it out correctly.',
      hint: null,
    });
  });

  it('enforces the maximum attempts without an unbounded evaluation loop', async () => {
    const { service, evaluationProvider } = setup({
      evaluationResults: [false, false, false, true],
    });
    const generated = await service.generate(groundedRun().id);
    const questionId = generated.activeQuestionId as string;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.answer(groundedRun().id, {
        questionId,
        answer: `Incorrect attempt ${attempt + 1}`,
      });
    }

    await expect(
      service.answer(groundedRun().id, {
        questionId,
        answer: 'A fourth attempt',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(evaluationProvider.evaluate).toHaveBeenCalledTimes(3);
  });
});
