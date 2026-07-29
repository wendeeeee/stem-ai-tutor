import { ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports PostgreSQL and pgvector versions', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          database: 'stem_tutor',
          postgresVersion: '16.0',
          vectorVersion: '0.8.0',
          trigramVersion: '1.6',
        },
      ]),
    } as unknown as DataSource;
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    } as unknown as Queue;
    const service = new HealthService(dataSource, queue);

    await expect(service.checkReadiness()).resolves.toEqual({
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

  it('fails readiness when pgvector is unavailable', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          database: 'stem_tutor',
          postgresVersion: '16.0',
          vectorVersion: null,
          trigramVersion: '1.6',
        },
      ]),
    } as unknown as DataSource;
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    } as unknown as Queue;
    const service = new HealthService(dataSource, queue);

    await expect(service.checkReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails readiness when pg_trgm is unavailable', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          database: 'stem_tutor',
          postgresVersion: '16.0',
          vectorVersion: '0.8.0',
          trigramVersion: null,
        },
      ]),
    } as unknown as DataSource;
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    } as unknown as Queue;
    const service = new HealthService(dataSource, queue);

    await expect(service.checkReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails readiness when Redis is unavailable', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          database: 'stem_tutor',
          postgresVersion: '16.0',
          vectorVersion: '0.8.0',
          trigramVersion: '1.6',
        },
      ]),
    } as unknown as DataSource;
    const queue = {
      getJobCounts: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as unknown as Queue;
    const service = new HealthService(dataSource, queue);

    await expect(service.checkReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
