import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CORPUS_INGESTION_QUEUE, EMBEDDING_PROVIDER } from './corpus.constants';
import { CorpusController } from './corpus.controller';
import { OpenAiEmbeddingProvider } from './embeddings/openai-embedding.provider';
import { CorpusChunk } from './entities/corpus-chunk.entity';
import { CorpusDocument } from './entities/corpus-document.entity';
import { CorpusSource } from './entities/corpus-source.entity';
import { CurriculumTopic } from './entities/curriculum-topic.entity';
import { IngestionRun } from './entities/ingestion-run.entity';
import { AdminIngestionKeyGuard } from './guards/admin-ingestion-key.guard';
import { CorpusIngestionProcessor } from './processors/corpus-ingestion.processor';
import { CorpusIngestionService } from './services/corpus-ingestion.service';
import { CorpusQueryService } from './services/corpus-query.service';
import { CorpusSearchService } from './services/corpus-search.service';
import { DocumentUploadService } from './services/document-upload.service';
import { PdfExtractorService } from './services/pdf-extractor.service';
import { TextChunkerService } from './services/text-chunker.service';
import { UploadStorageService } from './services/upload-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CorpusSource,
      CorpusDocument,
      CurriculumTopic,
      CorpusChunk,
      IngestionRun,
    ]),
    BullModule.registerQueue({ name: CORPUS_INGESTION_QUEUE }),
  ],
  controllers: [CorpusController],
  providers: [
    AdminIngestionKeyGuard,
    UploadStorageService,
    PdfExtractorService,
    TextChunkerService,
    DocumentUploadService,
    CorpusIngestionService,
    CorpusQueryService,
    CorpusSearchService,
    CorpusIngestionProcessor,
    {
      provide: EMBEDDING_PROVIDER,
      useClass: OpenAiEmbeddingProvider,
    },
  ],
  exports: [DocumentUploadService, CorpusQueryService, CorpusSearchService],
})
export class CorpusModule {}
