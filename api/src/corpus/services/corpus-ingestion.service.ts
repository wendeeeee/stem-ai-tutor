import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EMBEDDING_PROVIDER } from '../corpus.constants';
import { CorpusChunk } from '../entities/corpus-chunk.entity';
import { CorpusDocument } from '../entities/corpus-document.entity';
import { CurriculumTopic } from '../entities/curriculum-topic.entity';
import { IngestionRun } from '../entities/ingestion-run.entity';
import {
  IngestionJobData,
  IngestionJobResult,
} from '../interfaces/ingestion-job';
import { EmbeddingProvider } from '../embeddings/embedding-provider';
import { PdfExtractorService } from './pdf-extractor.service';
import { TextChunkerService } from './text-chunker.service';
import { UploadStorageService } from './upload-storage.service';

export type ProgressReporter = (progress: number) => Promise<void>;

@Injectable()
export class CorpusIngestionService {
  private readonly embeddingBatchSize: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectRepository(CorpusDocument)
    private readonly documentRepository: Repository<CorpusDocument>,
    @InjectRepository(IngestionRun)
    private readonly ingestionRepository: Repository<IngestionRun>,
    @InjectRepository(CurriculumTopic)
    private readonly topicRepository: Repository<CurriculumTopic>,
    private readonly storage: UploadStorageService,
    private readonly pdfExtractor: PdfExtractorService,
    private readonly chunker: TextChunkerService,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {
    this.embeddingBatchSize = this.config.get<number>(
      'EMBEDDING_BATCH_SIZE',
      50,
    );

    if (this.embeddingBatchSize < 1 || this.embeddingBatchSize > 500) {
      throw new Error('EMBEDDING_BATCH_SIZE must be between 1 and 500.');
    }
  }

  async process(
    job: IngestionJobData,
    reportProgress: ProgressReporter,
  ): Promise<IngestionJobResult> {
    const document = await this.documentRepository.findOne({
      where: { id: job.documentId },
    });

    if (!document || !document.storagePath) {
      throw new Error(
        'The queued document or its temporary PDF is unavailable.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(CorpusDocument, document.id, {
        status: 'processing',
        errorMessage: null,
      });
      await manager.update(IngestionRun, job.ingestionId, {
        status: 'processing',
        stage: 'extracting',
        progress: 5,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      });
    });
    await reportProgress(5);

    const pdfBuffer = await this.storage.read(document.storagePath);
    const extracted = await this.pdfExtractor.extract(pdfBuffer);
    await this.documentRepository.update(document.id, {
      pageCount: extracted.pageCount,
    });
    await this.updateProgress(job.ingestionId, 'chunking', 25, {
      pagesProcessed: extracted.pages.length,
    });
    await reportProgress(25);

    const preparedChunks = this.chunker.chunk(document.id, extracted.pages);
    if (preparedChunks.length === 0) {
      throw new Error('No usable text chunks were produced from the PDF.');
    }

    await this.updateProgress(job.ingestionId, 'embedding', 35, {
      chunksCreated: preparedChunks.length,
    });
    await reportProgress(35);

    const vectors: number[][] = [];
    let embeddingTokens = 0;
    let embeddingModel = '';
    let embeddingDimensions = 0;

    for (
      let offset = 0;
      offset < preparedChunks.length;
      offset += this.embeddingBatchSize
    ) {
      const batch = preparedChunks.slice(
        offset,
        offset + this.embeddingBatchSize,
      );
      const result = await this.embeddingProvider.embed(
        batch.map((chunk) => chunk.content),
      );
      vectors.push(...result.embeddings);
      embeddingTokens += result.inputTokens;
      embeddingModel = result.model;
      embeddingDimensions = result.dimensions;

      const embeddedCount = Math.min(
        offset + batch.length,
        preparedChunks.length,
      );
      const progress =
        35 + Math.floor((embeddedCount / preparedChunks.length) * 50);
      await this.updateProgress(job.ingestionId, 'embedding', progress, {
        chunksEmbedded: embeddedCount,
        embeddingTokens,
      });
      await reportProgress(progress);
    }

    const topic = await this.findOrCreateDefaultTopic(document);
    await this.updateProgress(job.ingestionId, 'saving', 90);
    await reportProgress(90);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CorpusChunk, { documentId: document.id });

      const rows = preparedChunks.map((chunk, index) =>
        manager.create(CorpusChunk, {
          ...chunk,
          documentId: document.id,
          topicId: topic?.id ?? null,
          embeddingModel,
          embeddingDimensions,
          embedding: vectors[index],
        }),
      );

      for (let offset = 0; offset < rows.length; offset += 100) {
        await manager.insert(CorpusChunk, rows.slice(offset, offset + 100));
      }

      await manager.update(CorpusDocument, document.id, {
        status: 'ready',
        errorMessage: null,
      });
      await manager.update(IngestionRun, job.ingestionId, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        chunksCreated: rows.length,
        chunksEmbedded: rows.length,
        embeddingTokens,
        topicsMapped: topic ? 1 : 0,
        unmappedChunks: topic ? 0 : rows.length,
        errorMessage: null,
        finishedAt: new Date(),
      });
    });
    await reportProgress(100);

    return {
      documentId: document.id,
      ingestionId: job.ingestionId,
      pageCount: extracted.pageCount,
      chunkCount: preparedChunks.length,
      embeddingTokens,
    };
  }

  async markAttemptFailed(
    job: IngestionJobData,
    error: unknown,
    finalAttempt: boolean,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unknown ingestion error';

    await this.dataSource.transaction(async (manager) => {
      await manager.update(CorpusDocument, job.documentId, {
        status: finalAttempt ? 'failed' : 'queued',
        errorMessage: message,
      });
      await manager.update(IngestionRun, job.ingestionId, {
        status: finalAttempt ? 'failed' : 'queued',
        stage: finalAttempt ? 'failed' : 'retrying',
        errorMessage: message,
        finishedAt: finalAttempt ? new Date() : null,
      });
    });
  }

  async releaseTemporaryFile(documentId: string): Promise<void> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
    });

    if (!document?.storagePath) {
      return;
    }

    await this.storage.remove(document.storagePath);
    await this.documentRepository.update(documentId, { storagePath: null });
  }

  private async findOrCreateDefaultTopic(
    document: CorpusDocument,
  ): Promise<CurriculumTopic | null> {
    if (!document.defaultTopicLabel) {
      return null;
    }

    const existing = await this.topicRepository.findOne({
      where: {
        subject: document.subject,
        schoolLevel: document.schoolLevel,
        curriculum: document.curriculum,
        label: document.defaultTopicLabel,
      },
    });

    if (existing) {
      return existing;
    }

    return this.topicRepository.save(
      this.topicRepository.create({
        subject: document.subject,
        schoolLevel: document.schoolLevel,
        curriculum: document.curriculum,
        label: document.defaultTopicLabel,
        code: document.defaultTopicCode,
        description: null,
      }),
    );
  }

  private async updateProgress(
    ingestionId: string,
    stage: string,
    progress: number,
    values: Partial<IngestionRun> = {},
  ): Promise<void> {
    await this.ingestionRepository.update(ingestionId, {
      ...values,
      stage,
      progress,
    });
  }
}
