import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReinforcementUsage } from './reinforcement.contracts';

@Entity({ name: 'reinforcement_attempts' })
export class ReinforcementAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'question_set_id', type: 'uuid' })
  questionSetId!: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @Column({ name: 'attempt_number', type: 'integer' })
  attemptNumber!: number;

  @Column({ name: 'student_answer', type: 'text' })
  studentAnswer!: string;

  @Column({ type: 'boolean' })
  correct!: boolean;

  @Column({ type: 'text' })
  feedback!: string;

  @Column({ type: 'text', nullable: true })
  hint!: string | null;

  @Column({ type: 'varchar', length: 120 })
  model!: string;

  @Column({ type: 'jsonb' })
  usage!: ReinforcementUsage;

  @Column({ name: 'evaluation_summary', type: 'varchar', length: 300 })
  evaluationSummary!: string;

  @Column({ name: 'latency_ms', type: 'integer' })
  latencyMs!: number;

  @Column({
    name: 'voice_session_id',
    type: 'uuid',
    nullable: true,
    unique: true,
  })
  voiceSessionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
