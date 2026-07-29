import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReinforcementLearning2026072412000 implements MigrationInterface {
  name = 'AddReinforcementLearning2026072412000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reinforcement_question_sets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL,
        "items" jsonb NOT NULL,
        "model" varchar(120) NOT NULL,
        "usage" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reinforcement_question_sets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reinforcement_question_sets_run" UNIQUE ("run_id"),
        CONSTRAINT "FK_reinforcement_question_sets_run"
          FOREIGN KEY ("run_id")
          REFERENCES "tutor_runs"("id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "reinforcement_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "question_set_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "attempt_number" integer NOT NULL,
        "student_answer" text NOT NULL,
        "correct" boolean NOT NULL,
        "feedback" text NOT NULL,
        "hint" text,
        "model" varchar(120) NOT NULL,
        "usage" jsonb NOT NULL,
        "evaluation_summary" varchar(300) NOT NULL,
        "latency_ms" integer NOT NULL,
        "voice_session_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reinforcement_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reinforcement_attempt_number"
          UNIQUE ("question_set_id", "question_id", "attempt_number"),
        CONSTRAINT "UQ_reinforcement_attempt_voice_session"
          UNIQUE ("voice_session_id"),
        CONSTRAINT "FK_reinforcement_attempts_set"
          FOREIGN KEY ("question_set_id")
          REFERENCES "reinforcement_question_sets"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_reinforcement_attempts_voice_session"
          FOREIGN KEY ("voice_session_id")
          REFERENCES "voice_sessions"("id")
          ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_reinforcement_attempts_set" ON "reinforcement_attempts" ("question_set_id", "created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_reinforcement_attempts_set"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "reinforcement_attempts"');
    await queryRunner.query(
      'DROP TABLE IF EXISTS "reinforcement_question_sets"',
    );
  }
}
