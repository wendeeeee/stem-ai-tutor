import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CORPUS_INGESTION_QUEUE } from '../corpus/corpus.constants';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [BullModule.registerQueue({ name: CORPUS_INGESTION_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
