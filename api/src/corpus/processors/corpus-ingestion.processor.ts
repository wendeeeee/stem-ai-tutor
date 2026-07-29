import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  CORPUS_INGESTION_QUEUE,
  INGEST_DOCUMENT_JOB,
} from '../corpus.constants';
import {
  IngestionJobData,
  IngestionJobResult,
} from '../interfaces/ingestion-job';
import { CorpusIngestionService } from '../services/corpus-ingestion.service';

@Processor(CORPUS_INGESTION_QUEUE, { concurrency: 1 })
export class CorpusIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(CorpusIngestionProcessor.name);

  constructor(private readonly ingestionService: CorpusIngestionService) {
    super();
  }

  async process(
    job: Job<IngestionJobData, IngestionJobResult, string>,
  ): Promise<IngestionJobResult> {
    if (job.name !== INGEST_DOCUMENT_JOB) {
      throw new Error(`Unsupported corpus job: ${job.name}`);
    }

    try {
      const result = await this.ingestionService.process(
        job.data,
        async (value) => {
          await job.updateProgress(value);
        },
      );
      await this.releaseFileSafely(job.data.documentId);
      return result;
    } catch (error: unknown) {
      const attempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= attempts;
      await this.ingestionService.markAttemptFailed(
        job.data,
        error,
        finalAttempt,
      );

      if (finalAttempt) {
        await this.releaseFileSafely(job.data.documentId);
      }

      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job<IngestionJobData>): void {
    this.logger.log(`Processing corpus ingestion ${job.data.ingestionId}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<IngestionJobData>): void {
    this.logger.log(`Completed corpus ingestion ${job.data.ingestionId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IngestionJobData> | undefined, error: Error): void {
    this.logger.error(
      `Corpus ingestion ${job?.data.ingestionId ?? 'unknown'} failed: ${error.message}`,
    );
  }

  private async releaseFileSafely(documentId: string): Promise<void> {
    try {
      await this.ingestionService.releaseTemporaryFile(documentId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown cleanup error';
      this.logger.warn(`Could not remove temporary corpus PDF: ${message}`);
    }
  }
}
