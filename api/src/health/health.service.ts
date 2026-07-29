import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { CORPUS_INGESTION_QUEUE } from '../corpus/corpus.constants';

interface DatabaseProbeRow {
  database: string;
  postgresVersion: string;
  vectorVersion: string | null;
  trigramVersion: string | null;
}

export interface ReadinessResult {
  status: 'ok';
  database: {
    status: 'connected';
    name: string;
    postgresVersion: string;
    vectorVersion: string;
    trigramVersion: string;
  };
  queue: {
    status: 'connected';
    provider: 'bullmq';
    datastore: 'redis';
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(CORPUS_INGESTION_QUEUE)
    private readonly ingestionQueue: Queue,
  ) {}

  async checkReadiness(): Promise<ReadinessResult> {
    let dependency = 'database';

    try {
      const rows = await this.dataSource.query<DatabaseProbeRow[]>(`
        SELECT
          current_database() AS database,
          current_setting('server_version') AS "postgresVersion",
          (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS "vectorVersion",
          (SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm') AS "trigramVersion"
      `);
      const database = rows[0];

      if (!database?.vectorVersion) {
        throw new Error('The pgvector extension is not installed.');
      }
      if (!database.trigramVersion) {
        throw new Error('The pg_trgm extension is not installed.');
      }

      dependency = 'queue';
      await this.ingestionQueue.getJobCounts('waiting', 'active');

      return {
        status: 'ok',
        database: {
          status: 'connected',
          name: database.database,
          postgresVersion: database.postgresVersion,
          vectorVersion: database.vectorVersion,
          trigramVersion: database.trigramVersion,
        },
        queue: {
          status: 'connected',
          provider: 'bullmq',
          datastore: 'redis',
        },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown database error';

      throw new ServiceUnavailableException({
        status: 'error',
        dependency,
        [dependency]: {
          status: 'unavailable',
          message,
        },
      });
    }
  }
}
