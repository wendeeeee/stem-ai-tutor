import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTranslatedTutorOutput2026072610000 implements MigrationInterface {
  name = 'AddTranslatedTutorOutput2026072610000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      ADD COLUMN "output_language" varchar(10) NOT NULL DEFAULT 'pcm',
      ADD COLUMN "translated_answer" text,
      ADD COLUMN "translation_metadata" jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      DROP COLUMN IF EXISTS "translation_metadata",
      DROP COLUMN IF EXISTS "translated_answer",
      DROP COLUMN IF EXISTS "output_language"
    `);
  }
}
