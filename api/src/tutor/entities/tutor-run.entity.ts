import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  CurriculumChunk,
  GroundingResult,
  QueryTransformation,
  StructuredRunError,
  TutorCitation,
  TutorRunMetrics,
  TutorRunStatus,
} from '../contracts/tutor-run-state';
import { AgentEvent } from './agent-event.entity';
import { ToolInvocation } from './tool-invocation.entity';
import {
  OutputLanguage,
  TranslationMetadata,
} from '../translation/translation.contracts';

@Entity({ name: 'tutor_runs' })
export class TutorRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, default: 'created' })
  status!: TutorRunStatus;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'varchar', length: 20, default: 'en' })
  language!: string;

  @Column({
    name: 'output_language',
    type: 'varchar',
    length: 10,
    default: 'pcm',
  })
  outputLanguage!: OutputLanguage;

  @Column({
    name: 'voice_session_id',
    type: 'uuid',
    nullable: true,
    unique: true,
  })
  voiceSessionId!: string | null;

  @Column({ name: 'query_transformation', type: 'jsonb', nullable: true })
  queryTransformation!: QueryTransformation | null;

  @Column({ name: 'retrieved_chunk_ids', type: 'jsonb', default: () => "'[]'" })
  retrievedChunkIds!: string[];

  @Column({ name: 'retrieved_chunks', type: 'jsonb', default: () => "'[]'" })
  retrievedChunks!: CurriculumChunk[];

  @Column({ name: 'draft_answer', type: 'text', nullable: true })
  draftAnswer!: string | null;

  @Column({ name: 'final_answer', type: 'text', nullable: true })
  finalAnswer!: string | null;

  @Column({ name: 'translated_answer', type: 'text', nullable: true })
  translatedAnswer!: string | null;

  @Column({ name: 'translation_metadata', type: 'jsonb', nullable: true })
  translationMetadata!: TranslationMetadata | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  citations!: TutorCitation[];

  @Column({ type: 'jsonb', nullable: true })
  grounding!: GroundingResult | null;

  @Column({ type: 'boolean', default: false })
  refused!: boolean;

  @Column({ name: 'refusal_reason', type: 'text', nullable: true })
  refusalReason!: string | null;

  @Column({ type: 'jsonb' })
  metrics!: TutorRunMetrics;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  errors!: StructuredRunError[];

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AgentEvent, (event) => event.run)
  events!: AgentEvent[];

  @OneToMany(() => ToolInvocation, (invocation) => invocation.run)
  toolInvocations!: ToolInvocation[];
}
