import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TutorRun } from '../../tutor/entities/tutor-run.entity';
import { AsrMetrics, TtsMetrics } from '../contracts/voice.contracts';
import { VoiceSession } from '../entities/voice-session.entity';
import { ReinforcementAttempt } from '../../tutor/reinforcement/reinforcement-attempt.entity';

@Injectable()
export class VoiceSessionService {
  constructor(
    @InjectRepository(VoiceSession)
    private readonly sessions: Repository<VoiceSession>,
    @InjectRepository(TutorRun)
    private readonly runs: Repository<TutorRun>,
    @InjectRepository(ReinforcementAttempt)
    private readonly reinforcementAttempts: Repository<ReinforcementAttempt>,
  ) {}

  async create(
    language: string,
    asrMetrics: AsrMetrics,
  ): Promise<VoiceSession> {
    return this.sessions.save(
      this.sessions.create({ language, asrMetrics, ttsMetrics: null }),
    );
  }

  async assertAvailable(sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new BadRequestException('Voice session not found.');
    }
    const [linkedRun, linkedAttempt] = await Promise.all([
      this.runs.exists({ where: { voiceSessionId: sessionId } }),
      this.reinforcementAttempts.exists({
        where: { voiceSessionId: sessionId },
      }),
    ]);
    if (linkedRun || linkedAttempt) {
      throw new BadRequestException(
        'This voice session is already linked to a submitted response.',
      );
    }
  }

  async saveTts(sessionId: string, metrics: TtsMetrics): Promise<void> {
    await this.sessions.update(sessionId, { ttsMetrics: metrics });
  }

  async createForTextRun(
    language: string,
    metrics: TtsMetrics,
  ): Promise<VoiceSession> {
    return this.sessions.save(
      this.sessions.create({ language, asrMetrics: null, ttsMetrics: metrics }),
    );
  }
}
