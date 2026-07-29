import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  CORPUS_VECTOR_DIMENSIONS,
  EMBEDDING_PROVIDER,
} from '../src/corpus/corpus.constants';
import { EmbeddingProvider } from '../src/corpus/embeddings/embedding-provider';

const describeIntegration =
  process.env.RUN_CORPUS_INTEGRATION === 'true' ? describe : describe.skip;

function createTextPdf(text: string): Buffer {
  const escaped = text
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf);
}

describeIntegration('Corpus ingestion (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;
  const adminKey = `test-${randomUUID()}`;
  const queuePrefix = `stem-ai-tutor-integration-${randomUUID()}`;
  const pdf = createTextPdf(
    'A physical change alters the form of a substance without producing a new substance. Melting ice is a physical change. A chemical change produces one or more new substances. Burning paper is a chemical change.',
  );
  const sha256 = createHash('sha256').update(pdf).digest('hex');

  beforeAll(async () => {
    process.env.ADMIN_INGESTION_KEY = adminKey;
    process.env.QUEUE_PREFIX = queuePrefix;
    process.env.CORPUS_UPLOAD_DIR = `/tmp/${queuePrefix}`;

    const embeddingProvider: EmbeddingProvider = {
      embed: jest.fn((texts: string[]) =>
        Promise.resolve({
          embeddings: texts.map(() => [
            1,
            ...Array<number>(CORPUS_VECTOR_DIMENSIONS - 1).fill(0),
          ]),
          model: 'test-embedding-model',
          dimensions: CORPUS_VECTOR_DIMENSIONS,
          inputTokens: texts.length * 10,
        }),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(embeddingProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    server = app.getHttpServer() as Server;
  }, 30_000);

  afterAll(async () => {
    const sources = await dataSource.query<{ sourceId: string }[]>(
      'SELECT source_id AS "sourceId" FROM corpus_documents WHERE sha256 = $1',
      [sha256],
    );
    await dataSource.query('DELETE FROM corpus_documents WHERE sha256 = $1', [
      sha256,
    ]);

    for (const source of sources) {
      await dataSource.query('DELETE FROM corpus_sources WHERE id = $1', [
        source.sourceId,
      ]);
    }

    await app.close();
  });

  it('uploads, queues, chunks, embeds, stores, and retrieves a PDF', async () => {
    const upload = await request(server)
      .post('/api/admin/corpus/documents')
      .set('x-admin-ingestion-key', adminKey)
      .field('subject', 'Basic Science')
      .field('schoolLevel', 'SS1')
      .field('curriculum', 'NERDC')
      .field('sourceTitle', 'Integration Test Science Text')
      .field('licence', 'Test fixture only')
      .field('topicLabel', 'Physical and Chemical Changes')
      .attach('file', pdf, {
        filename: 'changes.pdf',
        contentType: 'application/pdf',
      })
      .expect(202);

    const uploadBody = upload.body as unknown as { ingestionId: string };
    const ingestionId = uploadBody.ingestionId;
    let ingestion: Record<string, unknown> | undefined;

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const response = await request(server)
        .get(`/api/admin/corpus/ingestions/${ingestionId}`)
        .set('x-admin-ingestion-key', adminKey)
        .expect(200);
      ingestion = response.body as Record<string, unknown>;

      if (ingestion.status === 'completed' || ingestion.status === 'failed') {
        break;
      }

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }

    expect(ingestion).toMatchObject({
      status: 'completed',
      progress: 100,
      pagesProcessed: 1,
      topicsMapped: 1,
      unmappedChunks: 0,
    });
    expect(Number(ingestion?.chunksCreated)).toBeGreaterThan(0);

    const search = await request(server)
      .post('/api/admin/corpus/search')
      .set('x-admin-ingestion-key', adminKey)
      .send({ query: 'What is a physical change?', threshold: 0.5 })
      .expect(200);

    const searchBody = search.body as unknown as {
      count: number;
      results: Array<Record<string, unknown>>;
    };
    expect(searchBody.count).toBeGreaterThan(0);
    expect(searchBody.results[0]).toMatchObject({
      topicLabel: 'Physical and Chemical Changes',
      sourceTitle: 'Integration Test Science Text',
    });
  }, 30_000);
});
