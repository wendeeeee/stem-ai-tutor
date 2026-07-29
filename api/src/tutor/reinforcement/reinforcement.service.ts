import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { VoiceSessionService } from '../../voice/services/voice-session.service';
import { toSpeechText } from '../../voice/services/speech-text';
import { SubmitReinforcementAnswerDto } from '../dto/submit-reinforcement-answer.dto';
import { TutorRun } from '../entities/tutor-run.entity';
import {
  REINFORCEMENT_EVALUATION_PROVIDER,
  REINFORCEMENT_QUESTION_PROVIDER,
} from '../tutor.constants';
import {
  ReinforcementEvaluationProvider,
  ReinforcementItem,
  ReinforcementQuestionProvider,
  ReinforcementState,
} from './reinforcement.contracts';
import { ReinforcementAttempt } from './reinforcement-attempt.entity';
import { ReinforcementPolicyService } from './reinforcement-policy.service';
import { ReinforcementQuestionSet } from './reinforcement-question-set.entity';

@Injectable()
export class ReinforcementService {
  private readonly generations = new Map<string, Promise<ReinforcementState>>();
  private readonly evaluations = new Map<string, Promise<ReinforcementState>>();

  constructor(
    @InjectRepository(TutorRun)
    private readonly runs: Repository<TutorRun>,
    @InjectRepository(ReinforcementQuestionSet)
    private readonly sets: Repository<ReinforcementQuestionSet>,
    @InjectRepository(ReinforcementAttempt)
    private readonly attempts: Repository<ReinforcementAttempt>,
    @Inject(REINFORCEMENT_QUESTION_PROVIDER)
    private readonly questionProvider: ReinforcementQuestionProvider,
    @Inject(REINFORCEMENT_EVALUATION_PROVIDER)
    private readonly evaluationProvider: ReinforcementEvaluationProvider,
    private readonly policy: ReinforcementPolicyService,
    private readonly voiceSessions: VoiceSessionService,
  ) {}

  async generate(runId: string): Promise<ReinforcementState> {
    const existing = await this.sets.findOne({ where: { runId } });
    if (existing) return this.state(existing);
    const active = this.generations.get(runId);
    if (active) return active;
    const generation = this.create(runId).finally(() => {
      this.generations.delete(runId);
    });
    this.generations.set(runId, generation);
    return generation;
  }

  async get(runId: string): Promise<ReinforcementState> {
    const set = await this.sets.findOne({ where: { runId } });
    if (!set) {
      throw new NotFoundException(
        'Reinforcement questions have not been generated for this run.',
      );
    }
    return this.state(set);
  }

  async answer(
    runId: string,
    input: SubmitReinforcementAnswerDto,
  ): Promise<ReinforcementState> {
    const key = `${runId}:${input.questionId}`;
    const active = this.evaluations.get(key);
    if (active) {
      throw new ConflictException(
        'An answer for this reinforcement question is already being evaluated.',
      );
    }
    const evaluation = this.evaluate(runId, input).finally(() => {
      this.evaluations.delete(key);
    });
    this.evaluations.set(key, evaluation);
    return evaluation;
  }

  private async create(runId: string): Promise<ReinforcementState> {
    const run = await this.groundedRun(runId);
    const providerInput = {
      originalQuestion: run.question,
      finalAnswer: run.finalAnswer as string,
      citations: run.citations,
      chunks: run.retrievedChunks.filter((chunk) =>
        run.citations.some((citation) => citation.chunkId === chunk.chunkId),
      ),
      questionCount: this.policy.questionCount,
    };
    try {
      let accepted:
        | {
            result: Awaited<
              ReturnType<ReinforcementQuestionProvider['generate']>
            >;
            items: ReinforcementItem[];
          }
        | undefined;
      let lastError: unknown;
      for (
        let attempt = 0;
        attempt < this.policy.generationAttempts;
        attempt += 1
      ) {
        try {
          const result = await this.withTimeout(
            (signal) => this.questionProvider.generate(providerInput, signal),
            'generation',
          );
          accepted = {
            result,
            items: this.validateItems(
              result.items,
              run.finalAnswer as string,
              new Set(run.citations.map((citation) => citation.chunkId)),
            ),
          };
          break;
        } catch (error: unknown) {
          lastError = error;
          if (
            !this.retryableGenerationError(error) ||
            attempt + 1 >= this.policy.generationAttempts
          ) {
            throw error;
          }
        }
      }
      if (!accepted) throw lastError;
      const { result, items } = accepted;
      const set = await this.sets.save(
        this.sets.create({
          runId,
          items,
          model: result.model,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd: result.estimatedCostUsd,
          },
        }),
      );
      return this.state(set);
    } catch (error: unknown) {
      this.rethrowProviderError(error, 'generation');
    }
  }

  private async evaluate(
    runId: string,
    input: SubmitReinforcementAnswerDto,
  ): Promise<ReinforcementState> {
    await this.groundedRun(runId);
    const set = await this.sets.findOne({ where: { runId } });
    if (!set) {
      throw new ConflictException(
        'Generate reinforcement questions before submitting an answer.',
      );
    }
    const item = set.items.find(
      (candidate) => candidate.id === input.questionId,
    );
    if (!item) {
      throw new NotFoundException(
        'The reinforcement question does not belong to this tutor run.',
      );
    }
    const prior = await this.attempts.find({
      where: { questionSetId: set.id, questionId: item.id },
      order: { attemptNumber: 'ASC' },
    });
    if (prior.some((attempt) => attempt.correct)) {
      throw new ConflictException(
        'This reinforcement question has already been answered correctly.',
      );
    }
    if (prior.length >= this.policy.maxAttemptsPerQuestion) {
      throw new ConflictException(
        'The maximum attempts for this reinforcement question have been used.',
      );
    }
    if (input.voiceSessionId) {
      await this.voiceSessions.assertAvailable(input.voiceSessionId);
    }

    const started = Date.now();
    try {
      const result = await this.withTimeout(
        (signal) =>
          this.evaluationProvider.evaluate(
            {
              question: item.prompt,
              expectedAnswer: item.expectedAnswer,
              studentAnswer: input.answer,
            },
            signal,
          ),
        'evaluation',
      );
      const correct = result.correct && result.confidence !== 'low';
      const attemptNumber = prior.length + 1;
      const finalAttempt = attemptNumber >= this.policy.maxAttemptsPerQuestion;
      const feedback = correct
        ? attemptNumber === 1
          ? 'Excellent work! You understood that idea correctly.'
          : 'Well done! You used the hint and worked it out correctly.'
        : finalAttempt
          ? 'Thank you for trying. This one is not quite right yet, so revisit that part of the explanation before moving on.'
          : 'Good effort—you are thinking about the lesson. Try once more using the hint below.';
      await this.attempts.save(
        this.attempts.create({
          questionSetId: set.id,
          questionId: item.id,
          attemptNumber,
          studentAnswer: input.answer,
          correct,
          feedback,
          hint: correct ? null : item.hint,
          model: result.model,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostUsd: result.estimatedCostUsd,
          },
          evaluationSummary: result.evaluationSummary,
          latencyMs: Date.now() - started,
          voiceSessionId: input.voiceSessionId ?? null,
        }),
      );
      return this.state(set);
    } catch (error: unknown) {
      this.rethrowProviderError(error, 'evaluation');
    }
  }

  private async groundedRun(runId: string): Promise<TutorRun> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Tutor run not found.');
    if (
      run.status !== 'completed' ||
      run.refused ||
      !run.finalAnswer ||
      !run.grounding?.grounded
    ) {
      throw new ConflictException(
        'Reinforcement is available only for completed, grounded tutor runs.',
      );
    }
    return run;
  }

  private validateItems(
    drafts: Array<{
      prompt: string;
      expectedAnswer: string;
      hint: string;
      evidenceChunkIds: string[];
    }>,
    finalAnswer: string,
    allowedCitationIds: Set<string>,
  ): ReinforcementItem[] {
    if (drafts.length !== this.policy.questionCount) {
      throw new Error('INVALID_REINFORCEMENT_OUTPUT');
    }
    const readableAnswer = this.normalize(toSpeechText(finalAnswer));
    const prompts = new Set<string>();
    const expectedAnswers = new Set<string>();
    return drafts.map((draft, position) => {
      const prompt = draft.prompt.trim();
      const expectedAnswer = draft.expectedAnswer.trim();
      const hint = draft.hint.trim();
      const normalizedPrompt = this.normalize(prompt);
      const normalizedExpected = this.normalize(expectedAnswer);
      const normalizedHint = this.normalize(hint);
      const safeHint = this.hintLeaksAnswer(normalizedHint, normalizedExpected)
        ? 'Look back at the part of the explanation connected to this question, then describe the key idea in your own words.'
        : hint;
      if (
        normalizedPrompt.length < 5 ||
        normalizedExpected.length < 8 ||
        !readableAnswer.includes(normalizedExpected) ||
        prompts.has(normalizedPrompt) ||
        expectedAnswers.has(normalizedExpected) ||
        draft.evidenceChunkIds.length === 0 ||
        draft.evidenceChunkIds.some((id) => !allowedCitationIds.has(id))
      ) {
        throw new Error('INVALID_REINFORCEMENT_OUTPUT');
      }
      prompts.add(normalizedPrompt);
      expectedAnswers.add(normalizedExpected);
      return {
        id: randomUUID(),
        position,
        prompt,
        expectedAnswer,
        hint: safeHint,
        evidenceChunkIds: [...draft.evidenceChunkIds],
      };
    });
  }

  private async state(
    set: ReinforcementQuestionSet,
  ): Promise<ReinforcementState> {
    const attempts = await this.attempts.find({
      where: { questionSetId: set.id },
      order: { createdAt: 'ASC' },
    });
    const questions = set.items
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((item) => {
        const itemAttempts = attempts.filter(
          (attempt) => attempt.questionId === item.id,
        );
        const completed = itemAttempts.some((attempt) => attempt.correct);
        const exhausted =
          !completed &&
          itemAttempts.length >= this.policy.maxAttemptsPerQuestion;
        return {
          id: item.id,
          position: item.position,
          prompt: item.prompt,
          completed,
          exhausted,
          attemptsRemaining: Math.max(
            0,
            this.policy.maxAttemptsPerQuestion - itemAttempts.length,
          ),
          attempts: itemAttempts.map((attempt) => ({
            id: attempt.id,
            questionId: attempt.questionId,
            attemptNumber: attempt.attemptNumber,
            studentAnswer: attempt.studentAnswer,
            correct: attempt.correct,
            feedback: attempt.feedback,
            hint: attempt.hint,
            createdAt: attempt.createdAt,
          })),
        };
      });
    const active =
      questions.find(
        (question) => !question.completed && !question.exhausted,
      ) ?? null;
    return {
      runId: set.runId,
      questions,
      activeQuestionId: active?.id ?? null,
      complete: active === null,
      generation: {
        model: set.model,
        ...set.usage,
      },
    };
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hintLeaksAnswer(hint: string, expectedAnswer: string): boolean {
    if (hint.includes(expectedAnswer)) return true;
    const stopWords = new Set([
      'about',
      'after',
      'also',
      'because',
      'before',
      'being',
      'from',
      'have',
      'into',
      'that',
      'their',
      'there',
      'these',
      'they',
      'this',
      'what',
      'when',
      'where',
      'which',
      'with',
      'without',
      'would',
    ]);
    const words = (value: string): Set<string> =>
      new Set(
        value
          .split(' ')
          .filter((word) => word.length >= 4 && !stopWords.has(word)),
      );
    const expectedWords = words(expectedAnswer);
    if (expectedWords.size < 2) return false;
    const hintWords = words(hint);
    const overlap = [...expectedWords].filter((word) =>
      hintWords.has(word),
    ).length;
    return overlap / expectedWords.size >= 0.6;
  }

  private retryableGenerationError(error: unknown): boolean {
    const code = error instanceof Error ? error.message : '';
    return (
      !code.includes('NOT_CONFIGURED') &&
      !code.endsWith('_TIMEOUT') &&
      !(error instanceof ConflictException) &&
      !(error instanceof NotFoundException)
    );
  }

  private async withTimeout<T>(
    action: (signal: AbortSignal) => Promise<T>,
    stage: 'generation' | 'evaluation',
  ): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        action(controller.signal),
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`REINFORCEMENT_${stage.toUpperCase()}_TIMEOUT`));
          }, this.policy.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private rethrowProviderError(
    error: unknown,
    stage: 'generation' | 'evaluation',
  ): never {
    const code = error instanceof Error ? error.message : '';
    if (code.includes('NOT_CONFIGURED')) {
      throw new ServiceUnavailableException(
        'Reinforcement learning is not configured.',
      );
    }
    if (code.endsWith('_TIMEOUT')) {
      throw new GatewayTimeoutException(
        `Reinforcement ${stage} timed out. Please try again.`,
      );
    }
    if (
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }
    throw new BadGatewayException(
      `Reinforcement ${stage} could not complete safely.`,
    );
  }
}
