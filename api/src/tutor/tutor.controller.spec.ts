/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { EventEmitter } from 'node:events';
import { Response } from 'express';
import { TutorRunState, TraceEvent } from './contracts/tutor-run-state';
import { TutorOrchestratorService } from './services/tutor-orchestrator.service';
import { TutorRunQueryService } from './services/tutor-run-query.service';
import { TutorController } from './tutor.controller';
import { VoicePolicyService } from '../voice/policies/voice-policy.service';
import { VoiceSessionService } from '../voice/services/voice-session.service';
import { ReinforcementService } from './reinforcement/reinforcement.service';

function event(
  sequence: number,
  type: string,
  status: TraceEvent['status'],
): TraceEvent {
  return {
    sequence,
    type,
    stage: 'run',
    status,
    agentName: null,
    toolName: null,
    summary: {},
    latencyMs: null,
    tokenCount: 0,
    estimatedCostUsd: 0,
    retryCount: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
  };
}

function responseDouble() {
  const emitter = new EventEmitter();
  const writes: string[] = [];
  const response = {
    writableEnded: false,
    set: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((value: string) => {
      writes.push(value);
      return true;
    }),
    end: jest.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
  } as unknown as Response;
  return { response, emitter, writes };
}

describe('TutorController streaming', () => {
  const queries = {} as TutorRunQueryService;
  const sessions = {
    assertAvailable: jest.fn(() => Promise.resolve()),
  } as unknown as VoiceSessionService;
  const policy = { sseHeartbeatMs: 60_000 } as VoicePolicyService;
  const reinforcement = {} as ReinforcementService;
  const input = { question: 'What is energy?', language: 'en' };

  it('streams persisted progress in order before terminal completion', async () => {
    const orchestrator = {
      run: jest.fn(async (_input, options) => {
        await options.observer(event(0, 'run.created', 'info'));
        await options.observer(event(1, 'agent.started', 'started'));
        await options.observer(event(2, 'run.completed', 'completed'));
        return {} as TutorRunState;
      }),
    } as unknown as TutorOrchestratorService;
    const controller = new TutorController(
      orchestrator,
      queries,
      sessions,
      policy,
      reinforcement,
    );
    const { response, writes } = responseDouble();

    await controller.stream(input, response);

    const output = writes.join('');
    expect(output.indexOf('event: agent.started')).toBeLessThan(
      output.indexOf('event: run.completed'),
    );
    expect(output).toContain('id: 0');
    expect(response.end).toHaveBeenCalled();
  });

  it('aborts on disconnect and removes the close listener', async () => {
    let release: (() => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    const orchestrator = {
      run: jest.fn((_input, options) => {
        observedSignal = options.signal;
        return new Promise<TutorRunState>((resolve) => {
          release = () => resolve({} as TutorRunState);
        });
      }),
    } as unknown as TutorOrchestratorService;
    const controller = new TutorController(
      orchestrator,
      queries,
      sessions,
      policy,
      reinforcement,
    );
    const { response, emitter } = responseDouble();

    const pending = controller.stream(input, response);
    await Promise.resolve();
    expect(emitter.listenerCount('close')).toBe(1);
    emitter.emit('close');
    expect(observedSignal?.aborted).toBe(true);
    release?.();
    await pending;
    expect(emitter.listenerCount('close')).toBe(0);
  });
});
