import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CorpusDocument } from './corpus-document.entity';

@Entity({ name: 'corpus_sources' })
export class CorpusSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  author!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  publisher!: string | null;

  @Column({ name: 'source_url', type: 'varchar', length: 1000, nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'varchar', length: 200 })
  licence!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => CorpusDocument, (document) => document.source)
  documents!: CorpusDocument[];
}
