import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CorpusChunk } from './corpus-chunk.entity';
import { CorpusSource } from './corpus-source.entity';
import { IngestionRun } from './ingestion-run.entity';

export type CorpusDocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

@Entity({ name: 'corpus_documents' })
export class CorpusDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @ManyToOne(() => CorpusSource, (source) => source.documents, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'source_id' })
  source!: CorpusSource;

  @Column({ type: 'varchar', length: 150 })
  subject!: string;

  @Column({ name: 'school_level', type: 'varchar', length: 80 })
  schoolLevel!: string;

  @Column({ type: 'varchar', length: 100 })
  curriculum!: string;

  @Column({
    name: 'default_topic_label',
    type: 'varchar',
    length: 250,
    nullable: true,
  })
  defaultTopicLabel!: string | null;

  @Column({
    name: 'default_topic_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  defaultTopicCode!: string | null;

  @Column({ name: 'original_filename', type: 'varchar', length: 300 })
  originalFilename!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({ type: 'char', length: 64, unique: true })
  sha256!: string;

  @Column({
    name: 'storage_path',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  storagePath!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'queued' })
  status!: CorpusDocumentStatus;

  @Column({ name: 'page_count', type: 'integer', nullable: true })
  pageCount!: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => CorpusChunk, (chunk) => chunk.document)
  chunks!: CorpusChunk[];

  @OneToMany(() => IngestionRun, (run) => run.document)
  ingestionRuns!: IngestionRun[];
}
