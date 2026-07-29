import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CorpusChunk } from '../entities/corpus-chunk.entity';
import { CorpusDocument } from '../entities/corpus-document.entity';
import { IngestionRun } from '../entities/ingestion-run.entity';

@Injectable()
export class CorpusQueryService {
  constructor(
    @InjectRepository(CorpusDocument)
    private readonly documentRepository: Repository<CorpusDocument>,
    @InjectRepository(CorpusChunk)
    private readonly chunkRepository: Repository<CorpusChunk>,
    @InjectRepository(IngestionRun)
    private readonly ingestionRepository: Repository<IngestionRun>,
  ) {}

  async listDocuments(): Promise<Record<string, unknown>[]> {
    const documents = await this.documentRepository.find({
      relations: { source: true },
      order: { createdAt: 'DESC' },
    });
    const chunkCounts = await this.chunkCounts(
      documents.map((item) => item.id),
    );

    return documents.map((document) =>
      this.documentResponse(document, chunkCounts.get(document.id) ?? 0),
    );
  }

  async getDocument(documentId: string): Promise<Record<string, unknown>> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: { source: true },
    });

    if (!document) {
      throw new NotFoundException('Corpus document not found.');
    }

    const [chunkCount, ingestionRuns] = await Promise.all([
      this.chunkRepository.count({ where: { documentId } }),
      this.ingestionRepository.find({
        where: { documentId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      ...this.documentResponse(document, chunkCount),
      ingestionRuns: ingestionRuns.map((run) => this.ingestionResponse(run)),
    };
  }

  async getIngestion(ingestionId: string): Promise<Record<string, unknown>> {
    const ingestion = await this.ingestionRepository.findOne({
      where: { id: ingestionId },
      relations: { document: { source: true } },
    });

    if (!ingestion) {
      throw new NotFoundException('Ingestion run not found.');
    }

    return {
      ...this.ingestionResponse(ingestion),
      document: this.documentResponse(ingestion.document),
    };
  }

  private async chunkCounts(
    documentIds: string[],
  ): Promise<Map<string, number>> {
    if (documentIds.length === 0) {
      return new Map();
    }

    const counts = await this.chunkRepository
      .createQueryBuilder('chunk')
      .select('chunk.documentId', 'documentId')
      .addSelect('COUNT(*)', 'count')
      .where('chunk.documentId IN (:...documentIds)', { documentIds })
      .groupBy('chunk.documentId')
      .getRawMany<{ documentId: string; count: string }>();

    return new Map(counts.map((item) => [item.documentId, Number(item.count)]));
  }

  private documentResponse(
    document: CorpusDocument,
    chunkCount?: number,
  ): Record<string, unknown> {
    return {
      id: document.id,
      subject: document.subject,
      schoolLevel: document.schoolLevel,
      curriculum: document.curriculum,
      defaultTopicLabel: document.defaultTopicLabel,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
      status: document.status,
      pageCount: document.pageCount,
      chunkCount,
      errorMessage: document.errorMessage,
      source: {
        title: document.source.title,
        author: document.source.author,
        publisher: document.source.publisher,
        sourceUrl: document.source.sourceUrl,
        licence: document.source.licence,
      },
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private ingestionResponse(run: IngestionRun): Record<string, unknown> {
    return {
      id: run.id,
      documentId: run.documentId,
      jobId: run.bullmqJobId,
      status: run.status,
      stage: run.stage,
      progress: run.progress,
      pagesProcessed: run.pagesProcessed,
      chunksCreated: run.chunksCreated,
      chunksEmbedded: run.chunksEmbedded,
      embeddingTokens: run.embeddingTokens,
      topicsMapped: run.topicsMapped,
      unmappedChunks: run.unmappedChunks,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }
}
