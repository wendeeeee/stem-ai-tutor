import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVoiceMetrics2026072310000 implements MigrationInterface {
  name = 'AddVoiceMetrics2026072310000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "voice_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "language" varchar(20) NOT NULL DEFAULT 'en',
        "asr_metrics" jsonb,
        "tts_metrics" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_voice_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      ADD COLUMN "voice_session_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      ADD CONSTRAINT "UQ_tutor_runs_voice_session"
      UNIQUE ("voice_session_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      ADD CONSTRAINT "FK_tutor_runs_voice_session"
      FOREIGN KEY ("voice_session_id")
      REFERENCES "voice_sessions"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_voice_sessions_created" ON "voice_sessions" ("created_at" DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_voice_sessions_created"',
    );
    await queryRunner.query(
      'ALTER TABLE "tutor_runs" DROP CONSTRAINT IF EXISTS "FK_tutor_runs_voice_session"',
    );
    await queryRunner.query(
      'ALTER TABLE "tutor_runs" DROP CONSTRAINT IF EXISTS "UQ_tutor_runs_voice_session"',
    );
    await queryRunner.query(
      'ALTER TABLE "tutor_runs" DROP COLUMN IF EXISTS "voice_session_id"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "voice_sessions"');
  }
}
