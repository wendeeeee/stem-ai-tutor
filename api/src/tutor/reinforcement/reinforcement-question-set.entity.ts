import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  ReinforcementItem,
  ReinforcementUsage,
} from './reinforcement.contracts';

@Entity({ name: 'reinforcement_question_sets' })
export class ReinforcementQuestionSet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'run_id', type: 'uuid', unique: true })
  runId!: string;

  @Column({ type: 'jsonb' })
  items!: ReinforcementItem[];

  @Column({ type: 'varchar', length: 120 })
  model!: string;

  @Column({ type: 'jsonb' })
  usage!: ReinforcementUsage;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
