import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  const readiness = {
    status: 'ok' as const,
    database: {
      status: 'connected' as const,
      name: 'stem_tutor',
      postgresVersion: '16.0',
      vectorVersion: '0.8.0',
      trigramVersion: '1.6',
    },
    queue: {
      status: 'connected' as const,
      provider: 'bullmq' as const,
      datastore: 'redis' as const,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            checkReadiness: jest.fn().mockResolvedValue(readiness),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('reports that the process is alive', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('reports database readiness', async () => {
    await expect(controller.readiness()).resolves.toEqual(readiness);
  });
});
