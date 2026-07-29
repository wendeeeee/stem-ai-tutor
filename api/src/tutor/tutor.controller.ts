import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { TutorRunState } from './contracts/tutor-run-state';
import { CreateTutorRunDto } from './dto/create-tutor-run.dto';
import { TutorOrchestratorService } from './services/tutor-orchestrator.service';
import { TutorRunQueryService } from './services/tutor-run-query.service';
import { VoicePolicyService } from '../voice/policies/voice-policy.service';
import { VoiceSessionService } from '../voice/services/voice-session.service';
import { SubmitReinforcementAnswerDto } from './dto/submit-reinforcement-answer.dto';
import { ReinforcementState } from './reinforcement/reinforcement.contracts';
import { ReinforcementService } from './reinforcement/reinforcement.service';

@Controller('tutor/runs')
export class TutorController {
  constructor(
    private readonly orchestrator: TutorOrchestratorService,
    private readonly queries: TutorRunQueryService,
    private readonly voiceSessions: VoiceSessionService,
    private readonly voicePolicy: VoicePolicyService,
    private readonly reinforcement: ReinforcementService,
  ) {}

  @Post()
  async create(@Body() input: CreateTutorRunDto): Promise<TutorRunState> {
    if (input.voiceSessionId) {
      await this.voiceSessions.assertAvailable(input.voiceSessionId);
    }
    return this.orchestrator.run(input);
  }

  @Post('stream')
  async stream(
    @Body() input: CreateTutorRunDto,
    @Res() response: Response,
  ): Promise<void> {
    if (input.voiceSessionId) {
      await this.voiceSessions.assertAvailable(input.voiceSessionId);
    }
    response.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    const controller = new AbortController();
    let closed = false;
    const onClose = (): void => {
      closed = true;
      if (!response.writableEnded) controller.abort();
    };
    response.on('close', onClose);
    const heartbeat = setInterval(() => {
      if (!closed && !response.writableEnded) {
        response.write(': heartbeat\n\n');
      }
    }, this.voicePolicy.sseHeartbeatMs);

    try {
      await this.orchestrator.run(input, {
        signal: controller.signal,
        observer: (event) => {
          if (closed || response.writableEnded) return;
          response.write(`id: ${event.sequence}\n`);
          response.write(`event: ${event.type}\n`);
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });
    } finally {
      clearInterval(heartbeat);
      response.off('close', onClose);
      if (!closed && !response.writableEnded) response.end();
    }
  }

  @Get(':runId')
  get(@Param('runId', ParseUUIDPipe) runId: string): Promise<TutorRunState> {
    return this.queries.get(runId);
  }

  @Post(':runId/reinforcement')
  generateReinforcement(
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<ReinforcementState> {
    return this.reinforcement.generate(runId);
  }

  @Get(':runId/reinforcement')
  getReinforcement(
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<ReinforcementState> {
    return this.reinforcement.get(runId);
  }

  @Post(':runId/reinforcement/answers')
  async answerReinforcement(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() input: SubmitReinforcementAnswerDto,
  ): Promise<ReinforcementState> {
    return this.reinforcement.answer(runId, input);
  }
}
