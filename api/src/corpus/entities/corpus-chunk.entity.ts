import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CorpusDocument } from './corpus-document.entity';
import { CurriculumTopic } from './curriculum-topic.entity';

@Entity({ name: 'corpus_chunks' })
export class CorpusChunk {
  @PrimaryColumn({ type: 'char', length: 64 })
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => CorpusDocument, (document) => document.chunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: CorpusDocument;

  @Column({ name: 'topic_id', type: 'uuid', nullable: true })
  topicId!: string | null;

  @ManyToOne(() => CurriculumTopic, (topic) => topic.chunks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'topic_id' })
  topic!: CurriculumTopic | null;

  @Column({ name: 'chunk_index', type: 'integer' })
  chunkIndex!: number;

  @Column({ name: 'page_start', type: 'integer' })
  pageStart!: number;

  @Column({ name: 'page_end', type: 'integer' })
  pageEnd!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash!: string;

  @Column({ name: 'token_estimate', type: 'integer' })
  tokenEstimate!: number;

  @Column({ name: 'source_locator', type: 'varchar', length: 300 })
  sourceLocator!: string;

  @Column({ name: 'embedding_model', type: 'varchar', length: 100 })
  embeddingModel!: string;

  @Column({ name: 'embedding_dimensions', type: 'integer' })
  embeddingDimensions!: number;

  @Column('vector', { length: 1536 })
  embedding!: number[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
