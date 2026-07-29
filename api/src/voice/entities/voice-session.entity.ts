import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AsrMetrics, TtsMetrics } from '../contracts/voice.contracts';

@Entity({ name: 'voice_sessions' })
export class VoiceSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  language!: string;

  @Column({ name: 'asr_metrics', type: 'jsonb', nullable: true })
  asrMetrics!: AsrMetrics | null;

  @Column({ name: 'tts_metrics', type: 'jsonb', nullable: true })
  ttsMetrics!: TtsMetrics | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
