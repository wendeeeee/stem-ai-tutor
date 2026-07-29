import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TutorRun } from './tutor-run.entity';

export type ToolInvocationStatus = 'running' | 'completed' | 'failed';

@Entity({ name: 'tool_invocations' })
export class ToolInvocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @ManyToOne(() => TutorRun, (run) => run.toolInvocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'run_id' })
  run!: TutorRun;

  @Column({ name: 'agent_name', type: 'varchar', length: 100 })
  agentName!: string;

  @Column({ name: 'tool_name', type: 'varchar', length: 100 })
  toolName!: string;

  @Column({ type: 'varchar', length: 30, default: 'running' })
  status!: ToolInvocationStatus;

  @Column({ name: 'input_summary', type: 'jsonb', default: () => "'{}'" })
  inputSummary!: Record<string, unknown>;

  @Column({ name: 'result_summary', type: 'jsonb', nullable: true })
  resultSummary!: Record<string, unknown> | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null;

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

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
