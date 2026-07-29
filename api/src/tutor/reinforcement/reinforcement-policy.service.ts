import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReinforcementPolicyService {
  readonly questionCount: number;
  readonly generationAttempts: number;
  readonly maxAttemptsPerQuestion: number;
  readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.questionCount = this.integer(
      config,
      'REINFORCEMENT_QUESTION_COUNT',
      3,
      1,
      5,
    );
    this.generationAttempts = this.integer(
      config,
      'REINFORCEMENT_GENERATION_ATTEMPTS',
      2,
      1,
      3,
    );
    this.maxAttemptsPerQuestion = this.integer(
      config,
      'REINFORCEMENT_MAX_ATTEMPTS_PER_QUESTION',
      3,
      1,
      5,
    );
    this.timeoutMs = this.integer(
      config,
      'REINFORCEMENT_TIMEOUT_MS',
      30_000,
      1_000,
      60_000,
    );
  }

  private integer(
    config: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(config.get<string | number>(key, fallback));
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(
        `${key} must be an integer from ${minimum} to ${maximum}.`,
      );
    }
    return value;
  }
}
