import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CorpusDocument } from './corpus-document.entity';

export type IngestionStatus = 'queued' | 'processing' | 'completed' | 'failed';

@Entity({ name: 'ingestion_runs' })
export class IngestionRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => CorpusDocument, (document) => document.ingestionRuns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: CorpusDocument;

  @Column({
    name: 'bullmq_job_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  bullmqJobId!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'queued' })
  status!: IngestionStatus;

  @Column({ type: 'varchar', length: 50, default: 'queued' })
  stage!: string;

  @Column({ type: 'integer', default: 0 })
  progress!: number;

  @Column({ name: 'pages_processed', type: 'integer', default: 0 })
  pagesProcessed!: number;

  @Column({ name: 'chunks_created', type: 'integer', default: 0 })
  chunksCreated!: number;

  @Column({ name: 'chunks_embedded', type: 'integer', default: 0 })
  chunksEmbedded!: number;

  @Column({ name: 'embedding_tokens', type: 'integer', default: 0 })
  embeddingTokens!: number;

  @Column({ name: 'topics_mapped', type: 'integer', default: 0 })
  topicsMapped!: number;

  @Column({ name: 'unmapped_chunks', type: 'integer', default: 0 })
  unmappedChunks!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
