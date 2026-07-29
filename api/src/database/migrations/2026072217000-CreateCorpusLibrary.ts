import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCorpusLibrary2026072217000 implements MigrationInterface {
  name = 'CreateCorpusLibrary2026072217000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');

    await queryRunner.query(`
      CREATE TABLE "corpus_sources" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar(300) NOT NULL,
        "author" varchar(300),
        "publisher" varchar(300),
        "source_url" varchar(1000),
        "licence" varchar(200) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_corpus_sources" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "curriculum_topics" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subject" varchar(150) NOT NULL,
        "school_level" varchar(80) NOT NULL,
        "curriculum" varchar(100) NOT NULL,
        "code" varchar(80),
        "label" varchar(250) NOT NULL,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_curriculum_topic_identity"
          UNIQUE ("subject", "school_level", "curriculum", "label"),
        CONSTRAINT "PK_curriculum_topics" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "corpus_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source_id" uuid NOT NULL,
        "subject" varchar(150) NOT NULL,
        "school_level" varchar(80) NOT NULL,
        "curriculum" varchar(100) NOT NULL,
        "default_topic_label" varchar(250),
        "default_topic_code" varchar(80),
        "original_filename" varchar(300) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "size_bytes" integer NOT NULL,
        "sha256" char(64) NOT NULL,
        "storage_path" varchar(1000),
        "status" varchar(30) NOT NULL DEFAULT 'queued',
        "page_count" integer,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_corpus_documents_sha256" UNIQUE ("sha256"),
        CONSTRAINT "CHK_corpus_documents_status"
          CHECK ("status" IN ('queued', 'processing', 'ready', 'failed')),
        CONSTRAINT "FK_corpus_documents_source"
          FOREIGN KEY ("source_id") REFERENCES "corpus_sources"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "PK_corpus_documents" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ingestion_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL,
        "bullmq_job_id" varchar(100),
        "status" varchar(30) NOT NULL DEFAULT 'queued',
        "stage" varchar(50) NOT NULL DEFAULT 'queued',
        "progress" integer NOT NULL DEFAULT 0,
        "pages_processed" integer NOT NULL DEFAULT 0,
        "chunks_created" integer NOT NULL DEFAULT 0,
        "chunks_embedded" integer NOT NULL DEFAULT 0,
        "embedding_tokens" integer NOT NULL DEFAULT 0,
        "topics_mapped" integer NOT NULL DEFAULT 0,
        "unmapped_chunks" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_ingestion_runs_status"
          CHECK ("status" IN ('queued', 'processing', 'completed', 'failed')),
        CONSTRAINT "CHK_ingestion_runs_progress"
          CHECK ("progress" >= 0 AND "progress" <= 100),
        CONSTRAINT "FK_ingestion_runs_document"
          FOREIGN KEY ("document_id") REFERENCES "corpus_documents"("id")
          ON DELETE CASCADE,
        CONSTRAINT "PK_ingestion_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "corpus_chunks" (
        "id" char(64) NOT NULL,
        "document_id" uuid NOT NULL,
        "topic_id" uuid,
        "chunk_index" integer NOT NULL,
        "page_start" integer NOT NULL,
        "page_end" integer NOT NULL,
        "content" text NOT NULL,
        "content_hash" char(64) NOT NULL,
        "token_estimate" integer NOT NULL,
        "source_locator" varchar(300) NOT NULL,
        "embedding_model" varchar(100) NOT NULL,
        "embedding_dimensions" integer NOT NULL,
        "embedding" vector(1536) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_corpus_chunks_document_index"
          UNIQUE ("document_id", "chunk_index"),
        CONSTRAINT "FK_corpus_chunks_document"
          FOREIGN KEY ("document_id") REFERENCES "corpus_documents"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_corpus_chunks_topic"
          FOREIGN KEY ("topic_id") REFERENCES "curriculum_topics"("id")
          ON DELETE SET NULL,
        CONSTRAINT "PK_corpus_chunks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "IDX_corpus_documents_status" ON "corpus_documents" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ingestion_runs_document" ON "ingestion_runs" ("document_id", "created_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_corpus_chunks_document" ON "corpus_chunks" ("document_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_corpus_chunks_topic" ON "corpus_chunks" ("topic_id")',
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_corpus_chunks_embedding_hnsw"
      ON "corpus_chunks" USING hnsw ("embedding" vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "corpus_chunks"');
    await queryRunner.query('DROP TABLE IF EXISTS "ingestion_runs"');
    await queryRunner.query('DROP TABLE IF EXISTS "corpus_documents"');
    await queryRunner.query('DROP TABLE IF EXISTS "curriculum_topics"');
    await queryRunner.query('DROP TABLE IF EXISTS "corpus_sources"');
  }
}
