import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TutorRunState } from '../contracts/tutor-run-state';
import { AgentEvent } from '../entities/agent-event.entity';
import { ToolInvocation } from '../entities/tool-invocation.entity';
import { TutorRun } from '../entities/tutor-run.entity';
import { VoiceSession } from '../../voice/entities/voice-session.entity';
import {
  AppendTraceRecord,
  CreateTutorRunRecord,
  FinishToolRecord,
  StartToolRecord,
  TutorRunPatch,
  TutorRunStore,
} from './tutor-run-store';

@Injectable()
export class TypeOrmTutorRunStore implements TutorRunStore {
  constructor(
    @InjectRepository(TutorRun)
    private readonly runs: Repository<TutorRun>,
    @InjectRepository(AgentEvent)
    private readonly events: Repository<AgentEvent>,
    @InjectRepository(ToolInvocation)
    private readonly tools: Repository<ToolInvocation>,
    @InjectRepository(VoiceSession)
    private readonly voiceSessions: Repository<VoiceSession>,
  ) {}

  async createRun(
    input: CreateTutorRunRecord,
  ): Promise<{ id: string; createdAt: Date }> {
    const run = await this.runs.save(
      this.runs.create({
        question: input.question,
        language: input.language,
        outputLanguage: input.outputLanguage,
        voiceSessionId: input.voiceSessionId ?? null,
        status: 'created',
        queryTransformation: null,
        retrievedChunkIds: [],
        retrievedChunks: [],
        draftAnswer: null,
        finalAnswer: null,
        translatedAnswer: null,
        translationMetadata: null,
        citations: [],
        grounding: null,
        refused: false,
        refusalReason: null,
        metrics: input.metrics,
        errors: [],
        startedAt: null,
        completedAt: null,
      }),
    );
    return { id: run.id, createdAt: run.createdAt };
  }

  async updateRun(runId: string, patch: TutorRunPatch): Promise<void> {
    const values: Partial<TutorRun> = { ...patch };
    if (patch.retrievedChunks) {
      values.retrievedChunkIds = patch.retrievedChunks.map(
        (chunk) => chunk.chunkId,
      );
    }
    await this.runs.update(runId, values as QueryDeepPartialEntity<TutorRun>);
  }

  async appendTrace(input: AppendTraceRecord) {
    const event = await this.events.save(
      this.events.create({
        runId: input.runId,
        sequence: input.sequence,
        eventType: input.type,
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
      }),
    );
    return {
      id: event.id,
      sequence: event.sequence,
      type: event.eventType,
      stage: event.stage,
      status: event.status,
      agentName: event.agentName,
      toolName: event.toolName,
      summary: event.summary,
      latencyMs: event.latencyMs,
      tokenCount: event.tokenCount,
      estimatedCostUsd: event.estimatedCostUsd,
      retryCount: event.retryCount,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
      createdAt: event.createdAt,
    };
  }

  async startTool(input: StartToolRecord) {
    const tool = await this.tools.save(
      this.tools.create({
        ...input,
        status: 'running',
        resultSummary: null,
        durationMs: null,
        tokenCount: 0,
        estimatedCostUsd: 0,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      }),
    );
    return this.toolMetric(tool);
  }

  async finishTool(
    invocationId: string,
    patch: FinishToolRecord,
  ): Promise<void> {
    await this.tools.update(
      invocationId,
      patch as QueryDeepPartialEntity<ToolInvocation>,
    );
  }

  async getRun(runId: string): Promise<TutorRunState | null> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) return null;
    const [events, tools, voiceSession] = await Promise.all([
      this.events.find({ where: { runId }, order: { sequence: 'ASC' } }),
      this.tools.find({ where: { runId }, order: { createdAt: 'ASC' } }),
      run.voiceSessionId
        ? this.voiceSessions.findOne({ where: { id: run.voiceSessionId } })
        : Promise.resolve(null),
    ]);

    return {
      runId: run.id,
      voiceSessionId: run.voiceSessionId,
      status: run.status,
      question: run.question,
      language: run.language,
      outputLanguage: run.outputLanguage,
      queryTransformation: run.queryTransformation,
      retrievedChunks: run.retrievedChunks,
      draftAnswer: run.draftAnswer,
      finalAnswer: run.finalAnswer,
      translatedAnswer: run.translatedAnswer,
      translation: run.translationMetadata,
      citations: run.citations,
      grounding: run.grounding,
      refusal: { refused: run.refused, reason: run.refusalReason },
      metrics: run.metrics,
      voiceMetrics: voiceSession
        ? {
            voiceSessionId: voiceSession.id,
            asr: voiceSession.asrMetrics,
            tts: voiceSession.ttsMetrics,
          }
        : null,
      toolUsage: tools.map((tool) => this.toolMetric(tool)),
      trace: events.map((event) => ({
        id: event.id,
        sequence: event.sequence,
        type: event.eventType,
        stage: event.stage,
        status: event.status,
        agentName: event.agentName,
        toolName: event.toolName,
        summary: event.summary,
        latencyMs: event.latencyMs,
        tokenCount: event.tokenCount,
        estimatedCostUsd: event.estimatedCostUsd,
        retryCount: event.retryCount,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
        createdAt: event.createdAt,
      })),
      errors: run.errors.map((error) => ({
        ...error,
        occurredAt: new Date(error.occurredAt),
      })),
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  private toolMetric(tool: ToolInvocation) {
    return {
      invocationId: tool.id,
      agentName: tool.agentName,
      toolName: tool.toolName,
      status: tool.status,
      durationMs: tool.durationMs,
      tokenCount: tool.tokenCount,
      estimatedCostUsd: tool.estimatedCostUsd,
      retryCount: tool.retryCount,
      resultSummary: tool.resultSummary,
      errorCode: tool.errorCode,
      createdAt: tool.createdAt,
      completedAt: tool.completedAt,
    };
  }
}
