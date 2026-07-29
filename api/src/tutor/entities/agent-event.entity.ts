import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TraceEventStatus } from '../contracts/tutor-run-state';
import { TutorRun } from './tutor-run.entity';

@Entity({ name: 'agent_events' })
@Index('UQ_agent_events_run_sequence', ['runId', 'sequence'], { unique: true })
export class AgentEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @ManyToOne(() => TutorRun, (run) => run.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run!: TutorRun;

  @Column({ type: 'integer' })
  sequence!: number;

  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType!: string;

  @Column({ type: 'varchar', length: 80 })
  stage!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: TraceEventStatus;

  @Column({ name: 'agent_name', type: 'varchar', length: 100, nullable: true })
  agentName!: string | null;

  @Column({ name: 'tool_name', type: 'varchar', length: 100, nullable: true })
  toolName!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  summary!: Record<string, unknown>;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs!: number | null;

  @Column({ name: 'token_count', type: 'integer', default: 0 })
  tokenCount!: number;

  @Column({
    name: 'estimated_cost_usd',
    type: 'numeric',
    precision: 12,
    scale: 8,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  estimatedCostUsd!: number;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
