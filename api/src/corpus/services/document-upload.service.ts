import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  CORPUS_INGESTION_QUEUE,
  INGEST_DOCUMENT_JOB,
} from '../corpus.constants';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import { CorpusDocument } from '../entities/corpus-document.entity';
import { CorpusSource } from '../entities/corpus-source.entity';
import { IngestionRun } from '../entities/ingestion-run.entity';
import { IngestionJobData } from '../interfaces/ingestion-job';
import { UploadStorageService } from './upload-storage.service';

export interface QueuedDocumentResponse {
  documentId: string;
  ingestionId: string;
  status: 'queued';
}

@Injectable()
export class DocumentUploadService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CorpusDocument)
    private readonly documentRepository: Repository<CorpusDocument>,
    @InjectQueue(CORPUS_INGESTION_QUEUE)
    private readonly ingestionQueue: Queue<IngestionJobData>,
    private readonly storage: UploadStorageService,
  ) {}

  async enqueue(
    file: Express.Multer.File | undefined,
    metadata: UploadDocumentDto,
  ): Promise<QueuedDocumentResponse> {
    const storagePath = await this.storage.validateAndStore(file);
    const fileBuffer = file!.buffer;
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

    try {
      const existing = await this.documentRepository.findOne({
        where: { sha256 },
      });

      if (existing) {
        throw new ConflictException({
          message: 'This PDF has already been uploaded.',
          documentId: existing.id,
          status: existing.status,
        });
      }

      const created = await this.dataSource.transaction(async (manager) => {
        const source = manager.create(CorpusSource, {
          title: metadata.sourceTitle,
          author: metadata.author ?? null,
          publisher: metadata.publisher ?? null,
          sourceUrl: metadata.sourceUrl ?? null,
          licence: metadata.licence,
        });
        await manager.save(source);

        const document = manager.create(CorpusDocument, {
          sourceId: source.id,
          subject: metadata.subject,
          schoolLevel: metadata.schoolLevel,
          curriculum: metadata.curriculum,
          defaultTopicLabel: metadata.topicLabel ?? null,
          defaultTopicCode: metadata.topicCode ?? null,
          originalFilename: file!.originalname,
          mimeType: file!.mimetype,
          sizeBytes: file!.size,
          sha256,
          storagePath,
          status: 'queued',
          pageCount: null,
          errorMessage: null,
        });
        await manager.save(document);

        const ingestion = manager.create(IngestionRun, {
          documentId: document.id,
          status: 'queued',
          stage: 'queued',
          progress: 0,
        });
        await manager.save(ingestion);

        return { document, ingestion };
      });

      try {
        const job = await this.ingestionQueue.add(
          INGEST_DOCUMENT_JOB,
          {
            documentId: created.document.id,
            ingestionId: created.ingestion.id,
          },
          { jobId: created.ingestion.id },
        );

        await this.dataSource
          .getRepository(IngestionRun)
          .update(created.ingestion.id, { bullmqJobId: job.id ?? null });
      } catch (error: unknown) {
        const message = this.errorMessage(error);
        await this.dataSource.transaction(async (manager) => {
          await manager.update(CorpusDocument, created.document.id, {
            status: 'failed',
            storagePath: null,
            errorMessage: `Queue submission failed: ${message}`,
          });
          await manager.update(IngestionRun, created.ingestion.id, {
            status: 'failed',
            stage: 'queue-failed',
            errorMessage: message,
            finishedAt: new Date(),
          });
        });
        throw error;
      }

      return {
        documentId: created.document.id,
        ingestionId: created.ingestion.id,
        status: 'queued',
      };
    } catch (error: unknown) {
      await this.storage.remove(storagePath);
      throw error;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown queue error';
  }
}
