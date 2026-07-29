import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { AppModule } from '../app.module';
import { UploadDocumentDto } from '../corpus/dto/upload-document.dto';
import { CorpusQueryService } from '../corpus/services/corpus-query.service';
import { DocumentUploadService } from '../corpus/services/document-upload.service';

const REQUIRED_OPTIONS = [
  'file',
  'subject',
  'school-level',
  'curriculum',
  'source-title',
  'licence',
] as const;

function parseArguments(values: string[]): Map<string, string> {
  const options = new Map<string, string>();

  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];

    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Invalid CLI option near ${key ?? 'end of input'}.`);
    }

    options.set(key.slice(2), value);
  }

  for (const option of REQUIRED_OPTIONS) {
    if (!options.has(option)) {
      throw new Error(`Missing required option --${option}.`);
    }
  }

  return options;
}

function required(options: Map<string, string>, key: string): string {
  const value = options.get(key);
  if (!value) {
    throw new Error(`Missing required option --${key}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const filePath = resolve(required(options, 'file'));
  const [buffer, fileStats] = await Promise.all([
    readFile(filePath),
    stat(filePath),
  ]);
  const metadata = plainToInstance(UploadDocumentDto, {
    subject: required(options, 'subject'),
    schoolLevel: required(options, 'school-level'),
    curriculum: required(options, 'curriculum'),
    sourceTitle: required(options, 'source-title'),
    licence: required(options, 'licence'),
    author: options.get('author'),
    publisher: options.get('publisher'),
    sourceUrl: options.get('source-url'),
    topicLabel: options.get('topic-label'),
    topicCode: options.get('topic-code'),
  });
  await validateOrReject(metadata, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const file: Express.Multer.File = {
    fieldname: 'file',
    originalname: basename(filePath),
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: fileStats.size,
    destination: '',
    filename: basename(filePath),
    path: filePath,
    buffer,
    stream: Readable.from(buffer),
  };
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const uploads = app.get(DocumentUploadService);
    const queries = app.get(CorpusQueryService);
    const queued = await uploads.enqueue(file, metadata);
    process.stdout.write(
      `Queued ingestion ${queued.ingestionId} for document ${queued.documentId}.\n`,
    );

    while (true) {
      const ingestion = await queries.getIngestion(queued.ingestionId);
      const status = ingestion.status;
      const progress = ingestion.progress;
      const stage = ingestion.stage;
      process.stdout.write(`${String(progress)}% ${String(stage)}\n`);

      if (status === 'completed') {
        break;
      }

      if (status === 'failed') {
        const ingestionError = ingestion.errorMessage;
        throw new Error(
          typeof ingestionError === 'string'
            ? ingestionError
            : 'Ingestion failed.',
        );
      }

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Ingestion failed: ${message}\n`);
  process.exitCode = 1;
});
