import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SearchCorpusDto } from './dto/search-corpus.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { AdminIngestionKeyGuard } from './guards/admin-ingestion-key.guard';
import {
  DocumentUploadService,
  QueuedDocumentResponse,
} from './services/document-upload.service';
import { CorpusQueryService } from './services/corpus-query.service';
import {
  CorpusSearchResult,
  CorpusSearchService,
} from './services/corpus-search.service';

@Controller('admin/corpus')
@UseGuards(AdminIngestionKeyGuard)
export class CorpusController {
  constructor(
    private readonly uploads: DocumentUploadService,
    private readonly queries: CorpusQueryService,
    private readonly searchService: CorpusSearchService,
  ) {}

  @Post('documents')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() metadata: UploadDocumentDto,
  ): Promise<QueuedDocumentResponse> {
    return this.uploads.enqueue(file, metadata);
  }

  @Get('documents')
  listDocuments(): Promise<Record<string, unknown>[]> {
    return this.queries.listDocuments();
  }

  @Get('documents/:documentId')
  getDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<Record<string, unknown>> {
    return this.queries.getDocument(documentId);
  }

  @Get('ingestions/:ingestionId')
  getIngestion(
    @Param('ingestionId', ParseUUIDPipe) ingestionId: string,
  ): Promise<Record<string, unknown>> {
    return this.queries.getIngestion(ingestionId);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  search(@Body() input: SearchCorpusDto): Promise<CorpusSearchResult> {
    return this.searchService.search(input);
  }
}
