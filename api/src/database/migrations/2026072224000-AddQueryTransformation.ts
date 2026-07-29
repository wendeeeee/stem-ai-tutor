import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQueryTransformation2026072224000 implements MigrationInterface {
  name = 'AddQueryTransformation2026072224000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      ADD COLUMN "query_transformation" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tutor_runs"
      DROP COLUMN "query_transformation"
    `);
  }
}
