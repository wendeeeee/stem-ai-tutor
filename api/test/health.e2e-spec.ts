import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { CORPUS_INGESTION_QUEUE } from '../src/corpus/corpus.constants';
import { afterAll, beforeAll, describe, it, jest } from '@jest/globals';

interface DatabaseHealthRow {
  database: string;
  postgresVersion: string;
  vectorVersion: string;
  trigramVersion: string;
}

describe('Health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const dataSource = {
      query: jest.fn<() => Promise<DatabaseHealthRow[]>>().mockResolvedValue([
        {
          database: 'stem_tutor',
          postgresVersion: '16.0',
          vectorVersion: '0.8.0',
          trigramVersion: '1.6',
        },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getQueueToken(CORPUS_INGESTION_QUEUE),
          useValue: {
            getJobCounts: jest
              .fn<() => Promise<{ waiting: number; active: number }>>()
              .mockResolvedValue({ waiting: 0, active: 0 }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts and serves the liveness endpoint', async () => {
    const server = app.getHttpServer() as Server;

    await request(server)
      .get('/api/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('serves the database readiness endpoint', async () => {
    const server = app.getHttpServer() as Server;

    await request(server)
      .get('/api/health')
      .expect(200)
      .expect({
        status: 'ok',
        database: {
          status: 'connected',
          name: 'stem_tutor',
          postgresVersion: '16.0',
          vectorVersion: '0.8.0',
          trigramVersion: '1.6',
        },
        queue: {
          status: 'connected',
          provider: 'bullmq',
          datastore: 'redis',
        },
      });
  });
});
