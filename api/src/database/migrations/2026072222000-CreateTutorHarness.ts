import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTutorHarness2026072222000 implements MigrationInterface {
  name = 'CreateTutorHarness2026072222000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tutor_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" varchar(30) NOT NULL DEFAULT 'created',
        "question" text NOT NULL,
        "language" varchar(20) NOT NULL DEFAULT 'en',
        "retrieved_chunk_ids" jsonb NOT NULL DEFAULT '[]',
        "retrieved_chunks" jsonb NOT NULL DEFAULT '[]',
        "draft_answer" text,
        "final_answer" text,
        "citations" jsonb NOT NULL DEFAULT '[]',
        "grounding" jsonb,
        "refused" boolean NOT NULL DEFAULT false,
        "refusal_reason" text,
        "metrics" jsonb NOT NULL,
        "errors" jsonb NOT NULL DEFAULT '[]',
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_tutor_runs_status" CHECK
          ("status" IN ('created', 'running', 'completed', 'refused', 'failed')),
        CONSTRAINT "PK_tutor_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "agent_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL,
        "sequence" integer NOT NULL,
        "event_type" varchar(80) NOT NULL,
        "stage" varchar(80) NOT NULL,
        "status" varchar(30) NOT NULL,
        "agent_name" varchar(100),
        "tool_name" varchar(100),
        "summary" jsonb NOT NULL DEFAULT '{}',
        "latency_ms" integer,
        "token_count" integer NOT NULL DEFAULT 0,
        "estimated_cost_usd" numeric(12,8) NOT NULL DEFAULT 0,
        "retry_count" integer NOT NULL DEFAULT 0,
        "error_code" varchar(80),
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_agent_events_run_sequence" UNIQUE ("run_id", "sequence"),
        CONSTRAINT "CHK_agent_events_status" CHECK
          ("status" IN ('started', 'completed', 'failed', 'info')),
        CONSTRAINT "FK_agent_events_run" FOREIGN KEY ("run_id")
          REFERENCES "tutor_runs"("id") ON DELETE CASCADE,
        CONSTRAINT "PK_agent_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tool_invocations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL,
        "agent_name" varchar(100) NOT NULL,
        "tool_name" varchar(100) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'running',
        "input_summary" jsonb NOT NULL DEFAULT '{}',
        "result_summary" jsonb,
        "duration_ms" integer,
        "token_count" integer NOT NULL DEFAULT 0,
        "estimated_cost_usd" numeric(12,8) NOT NULL DEFAULT 0,
        "retry_count" integer NOT NULL DEFAULT 0,
        "error_code" varchar(80),
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "CHK_tool_invocations_status" CHECK
          ("status" IN ('running', 'completed', 'failed')),
        CONSTRAINT "FK_tool_invocations_run" FOREIGN KEY ("run_id")
          REFERENCES "tutor_runs"("id") ON DELETE CASCADE,
        CONSTRAINT "PK_tool_invocations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "IDX_tutor_runs_created" ON "tutor_runs" ("created_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_agent_events_run" ON "agent_events" ("run_id", "sequence")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_tool_invocations_run" ON "tool_invocations" ("run_id", "created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "tool_invocations"');
    await queryRunner.query('DROP TABLE IF EXISTS "agent_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "tutor_runs"');
  }
}
