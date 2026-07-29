import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHybridCorpusSearch2026072223000 implements MigrationInterface {
  name = 'AddHybridCorpusSearch2026072223000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(`
      CREATE INDEX "IDX_corpus_chunks_content_fts"
      ON "corpus_chunks"
      USING gin (to_tsvector('english', "content"))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_corpus_chunks_content_trgm"
      ON "corpus_chunks"
      USING gin (lower("content") gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_corpus_chunks_content_trgm"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_corpus_chunks_content_fts"',
    );
  }
}
