import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CorpusChunk } from './corpus-chunk.entity';

@Entity({ name: 'curriculum_topics' })
export class CurriculumTopic {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  subject!: string;

  @Column({ name: 'school_level', type: 'varchar', length: 80 })
  schoolLevel!: string;

  @Column({ type: 'varchar', length: 100 })
  curriculum!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  code!: string | null;

  @Column({ type: 'varchar', length: 250 })
  label!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => CorpusChunk, (chunk) => chunk.topic)
  chunks!: CorpusChunk[];
}
