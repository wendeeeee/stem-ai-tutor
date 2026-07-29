# Building a Grounded Multi-Agent Voice STEM Tutor from Scratch

## A milestone-by-milestone implementation tutorial

This tutorial documents how we are building **STEM AI Tutor**, a curriculum-grounded, multi-agent voice tutoring proof of concept. It is written as a living article: each completed milestone will be added here with the implementation decisions, code, tests, problems encountered, and verification evidence.

The finished application will allow a secondary-school student to ask a STEM question aloud, retrieve supporting material from an approved curriculum corpus, receive a cited answer, hear that answer spoken back, and complete a short grounded learning check. A multi-agent harness coordinates retrieval, tutoring, grounding verification, and bounded answer evaluation while recording a complete pipeline trace.

We are intentionally building this in layers. Before adding curriculum data, AI agents, or browser audio, we need to know that the application can start and communicate reliably with its database.

## Article progress

| Milestone | Outcome | Status |
|---|---|---|
| 1. Application foundation | NestJS API, PostgreSQL 16, pgvector, health checks, and test baseline | Complete |
| 2. Grounded curriculum library | Upload, queue, schema, extraction, chunking, embeddings, and retrieval | Complete |
| 3. Multi-agent harness | Shared run state, orchestration, tools, tracing, budgets, and agent contracts | Complete |
| 4. Grounded text tutor | Retrieval, tutoring, verification, citation enforcement, and refusal behavior | Complete |
| 5. Voice and trace interface | Push-to-talk, transcription, trace UI, speech synthesis, and bounded learning checks | Complete |
| 6. Evaluation and evidence | YarnGPT tutor voice, fixture harness, live results, screenshots, and local recording | Historical implementation/evaluation preserved |
| 7. Tutor voice provider revision | ElevenLabs adapter, 8,000-character answers, generic evaluation, privacy/cost revision | Implemented; live voice selection blocked on local credential |

---

# Milestone 1: Establishing the Application Foundation

## What we are building in this milestone

At the end of Milestone 1, we want to prove four things:

1. The Node.js project installs reproducibly.
2. The NestJS API can start and serve HTTP requests.
3. The API can connect to PostgreSQL 16.
4. The database has the pgvector extension required for semantic retrieval.

This milestone deliberately contains no curriculum corpus, embeddings, LLM calls, agents, or frontend. Those features would be difficult to diagnose if the server and database foundation were still uncertain.

The resulting foundation looks like this:

```text
HTTP client
    │
    │ GET /api/health/live
    │ GET /api/health
    ▼
NestJS API
    │
    │ TypeORM connection
    ▼
PostgreSQL 16
    └── pgvector 0.8.0
```

## 1. Prerequisites

Install the following before starting:

- Git.
- Node.js 22 and npm 10 or later.
- Docker with Docker Compose support.
- `curl`, or another HTTP client.

Node.js 22 is the intended project runtime. The current code is also compatible with Node.js 20, which is useful when developing in an environment that has not yet moved to Node.js 22.

Verify the tools:

```bash
git --version
node --version
npm --version
docker --version
docker compose version
```

If you use Docker Desktop with WSL 2, make sure Docker Desktop is running and WSL integration is enabled for your Linux distribution. A `docker: command not found` message inside WSL often means the integration has not been enabled.

## 2. Create or clone the repository

Create a repository named `stem-ai-tutor`, clone it, and enter the project directory:

```bash
git clone <your-repository-url> stem-ai-tutor
cd stem-ai-tutor
```

At this stage the repository can be empty apart from its `.git` directory.

## 3. Choose the repository structure

The proof of concept will eventually contain an API, browser client, curriculum ingestion tools, evaluation fixtures, and seminar evidence. Milestone 1 begins with the API but uses an npm workspace so additional packages can be added without restructuring the project later.

Create this initial layout:

```text
stem-ai-tutor/
├── api/
│   ├── src/
│   └── test/
├── database/
│   └── init/
├── docs/
├── .env.example
├── .gitignore
├── .nvmrc
├── compose.yaml
├── package.json
└── README.md
```

The root `package.json` owns commands that apply to the project as a whole. The API has its own package and dependencies under `api/package.json`.

## 4. Configure the root npm workspace

Create the root `package.json`:

```json
{
  "name": "stem-ai-tutor",
  "version": "0.1.0",
  "private": true,
  "description": "A curriculum-grounded, multi-agent voice STEM tutor proof of concept.",
  "workspaces": ["api"],
  "engines": {
    "node": ">=20 <23"
  },
  "scripts": {
    "build": "npm run build --workspace api",
    "start": "npm run start --workspace api",
    "start:dev": "npm run start:dev --workspace api",
    "lint": "npm run lint --workspace api",
    "test": "npm run test --workspace api",
    "test:e2e": "npm run test:e2e --workspace api",
    "db:up": "docker compose up -d database",
    "db:down": "docker compose down",
    "db:logs": "docker compose logs database"
  }
}
```

There are two useful details here:

- `private: true` prevents accidentally publishing the workspace root to npm.
- Root scripts hide workspace-specific commands, so contributors can run `npm test` or `npm run start:dev` without remembering where the API lives.

Add `.nvmrc` so developers using `nvm` can select the intended runtime:

```text
22
```

Then add a `.gitignore` that excludes dependencies, build output, test coverage, logs, and environment secrets:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
.idea/
.vscode/
```

The `!.env.example` exception is important: the real `.env` must remain private, while the template should be committed.

## 5. Create the NestJS API package

The API uses NestJS 11, TypeORM, and the PostgreSQL driver. Its main runtime dependencies are:

- `@nestjs/common`, `@nestjs/core`, and `@nestjs/platform-express` for the HTTP application.
- `@nestjs/config` for environment configuration.
- `@nestjs/typeorm` and `typeorm` for database integration.
- `pg` as the PostgreSQL driver.
- `reflect-metadata` and `rxjs`, which NestJS uses at runtime.

The API package exposes these scripts:

```json
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
  }
}
```

The repository contains the complete dependency list in `api/package.json`. Install everything from the repository root:

```bash
npm install
```

Because npm workspaces are enabled, this installs both root and API dependencies and creates one root `package-lock.json`. Commit the lockfile so CI and other developers resolve the same dependency tree.

## 6. Bootstrap the NestJS application

Create `api/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
```

This bootstrap function makes three early architectural decisions:

1. All routes use the `/api` prefix, separating API paths from a future web client.
2. The port comes from configuration and defaults to `3000`.
3. Shutdown hooks are enabled so NestJS and TypeORM can close resources cleanly when the process stops.

## 7. Run PostgreSQL and pgvector with Docker Compose

A normal PostgreSQL image does not include the vector extension we will need for curriculum embeddings. Use the pgvector image based on PostgreSQL 16.

Create `compose.yaml`:

```yaml
services:
  database:
    image: pgvector/pgvector:0.8.0-pg16
    environment:
      POSTGRES_DB: stem_tutor
      POSTGRES_USER: stem_tutor
      POSTGRES_PASSWORD: stem_tutor
    ports:
      - "5432:5432"
    volumes:
      - stem_tutor_postgres:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stem_tutor -d stem_tutor"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 5s
    restart: unless-stopped

volumes:
  stem_tutor_postgres:
```

The named volume preserves database data when the container is recreated. The health check prevents us from assuming that a running container is already ready to accept queries.

The credentials above are local-development defaults, not production credentials. Production secrets must be supplied through the deployment environment and must never be committed.

Create `database/init/001-enable-vector.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Files in `/docker-entrypoint-initdb.d` run when PostgreSQL initializes a new data directory. `IF NOT EXISTS` makes the statement safe to run when the extension is already present.

One subtle point: initialization scripts do not rerun against an existing Docker volume. If this script is added after the database volume has already been created, run the SQL manually or deliberately recreate the development volume after confirming that it contains no data you need.

## 8. Add environment configuration

Create `.env.example`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://stem_tutor:stem_tutor@localhost:5432/stem_tutor
DATABASE_SSL=false
```

Copy it to a local `.env` file:

```bash
cp .env.example .env
```

Do not commit `.env`. The example documents the required configuration, while the ignored local file can safely contain environment-specific credentials later.

## 9. Connect NestJS to PostgreSQL

Create `api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', '../.env'],
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');

        if (!databaseUrl) {
          throw new Error(
            'DATABASE_URL is required. Copy .env.example to .env before starting the API.',
          );
        }

        return {
          type: 'postgres' as const,
          url: databaseUrl,
          ssl:
            config.get<string>('DATABASE_SSL', 'false') === 'true'
              ? { rejectUnauthorized: false }
              : false,
          autoLoadEntities: true,
          synchronize: false,
          retryAttempts: 3,
          retryDelay: 1_000,
        };
      },
    }),
    HealthModule,
  ],
})
export class AppModule {}
```

Why configure TypeORM this way?

- `forRootAsync` allows the connection to use environment configuration through `ConfigService`.
- Missing `DATABASE_URL` fails with a specific setup message instead of an obscure driver error.
- `DATABASE_SSL` supports a future hosted database without forcing SSL locally.
- `synchronize: false` prevents TypeORM from silently changing the schema. Explicit migrations will own schema changes beginning with the curriculum library milestone.
- Short, bounded retries handle a database container that becomes ready just after the API starts without making configuration failures hang indefinitely.

The configuration searches `.env` and `../.env` because npm workspace commands can run with either the repository root or the API package as their effective working directory.

## 10. Add liveness and readiness health checks

Liveness and readiness answer different questions:

- **Liveness:** Is the API process running and able to serve an HTTP request?
- **Readiness:** Can this instance perform its work, including reaching PostgreSQL and using pgvector?

Create `api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { HealthService, ReadinessResult } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  readiness(): Promise<ReadinessResult> {
    return this.healthService.checkReadiness();
  }
}
```

The liveness endpoint intentionally does not query the database. A temporary database failure should make the application unready, not falsely indicate that the API process itself is dead.

Create `api/src/health/health.service.ts`. Its readiness query checks the connection, PostgreSQL version, and pgvector extension in one round trip:

```ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface DatabaseProbeRow {
  database: string;
  postgresVersion: string;
  vectorVersion: string | null;
}

export interface ReadinessResult {
  status: 'ok';
  database: {
    status: 'connected';
    name: string;
    postgresVersion: string;
    vectorVersion: string;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async checkReadiness(): Promise<ReadinessResult> {
    try {
      const rows = await this.dataSource.query<DatabaseProbeRow[]>(`
        SELECT
          current_database() AS database,
          current_setting('server_version') AS "postgresVersion",
          (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS "vectorVersion"
      `);
      const database = rows[0];

      if (!database?.vectorVersion) {
        throw new Error('The pgvector extension is not installed.');
      }

      return {
        status: 'ok' as const,
        database: {
          status: 'connected' as const,
          name: database.database,
          postgresVersion: database.postgresVersion,
          vectorVersion: database.vectorVersion,
        },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown database error';

      throw new ServiceUnavailableException({
        status: 'error',
        database: {
          status: 'unavailable',
          message,
        },
      });
    }
  }
}
```

Checking only `SELECT 1` would prove that PostgreSQL is reachable, but it would not prove that the vector extension is installed. Since pgvector is essential to the next milestone, readiness includes it from the beginning.

Register the controller and service in `api/src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
```

## 11. Add the automated test baseline

Milestone 1 has two test layers.

### Unit tests

The controller tests replace `HealthService` with a mock and verify that the controller returns the expected liveness and readiness responses.

The service tests replace TypeORM's `DataSource` with a mock and verify two important paths:

1. PostgreSQL and pgvector details are returned when the readiness query succeeds.
2. Readiness fails with `ServiceUnavailableException` when the vector extension is missing.

The second path matters because a reachable PostgreSQL database without pgvector is not sufficient for this application.

### HTTP smoke tests

The end-to-end smoke test starts a real NestJS HTTP application with a controlled database probe. It requests both routes through the HTTP adapter:

```ts
await request(server)
  .get('/api/health/live')
  .expect(200)
  .expect({ status: 'ok' });

await request(server)
  .get('/api/health')
  .expect(200)
  .expect({
    status: 'ok',
    database: {
      status: 'connected',
      name: 'stem_tutor',
      postgresVersion: '16.0',
      vectorVersion: '0.8.0',
    },
  });
```

The database is mocked in this particular test because its purpose is to verify application bootstrap, dependency injection, routing, and response serialization. The manual readiness check in the next section verifies the real database integration.

Run all code-quality checks:

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

For this milestone, the result was:

```text
Lint:        passed
Unit tests:  4 passed
HTTP tests:  2 passed
Build:       passed
Audit:       0 known vulnerabilities
```

## 12. Start the database and API

Start PostgreSQL in the background:

```bash
npm run db:up
```

Inspect its state:

```bash
docker compose ps
npm run db:logs
```

Wait until the database is healthy, then start NestJS in development mode:

```bash
npm run start:dev
```

NestJS should start on port `3000`. Keep this terminal open and use a second terminal for the verification requests.

## 13. Verify the running system

First, check the API process:

```bash
curl http://localhost:3000/api/health/live
```

Expected response:

```json
{"status":"ok"}
```

Then check the real database connection and pgvector installation:

```bash
curl http://localhost:3000/api/health
```

The verified development environment returned:

```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "name": "stem_tutor",
    "postgresVersion": "16.10 (Debian 16.10-1.pgdg12+1)",
    "vectorVersion": "0.8.0"
  }
}
```

This response proves more than the fact that the process started:

- NestJS accepted and routed an HTTP request.
- TypeORM established a real PostgreSQL connection.
- The application connected to the expected database.
- The database is running PostgreSQL 16.
- pgvector 0.8.0 is installed and visible to the application.

Milestone 1 is complete only after both health requests succeed against the running system.

## 14. Troubleshooting

### Docker is unavailable inside WSL

If running `docker --version` produces a message about WSL integration:

1. Start Docker Desktop in Windows.
2. Open Docker Desktop settings.
3. Enable the WSL 2 engine.
4. Enable integration for the Linux distribution used for development.
5. Restart the WSL terminal and rerun `docker --version`.

### Port 5432 is already in use

Another PostgreSQL installation or container may already be listening on the default port. Inspect running containers and local services before changing the port. If the Compose host port is changed, update `DATABASE_URL` to match it.

### The API says `DATABASE_URL is required`

Create the local environment file from the committed template:

```bash
cp .env.example .env
```

Then restart the API.

### PostgreSQL connects but readiness says pgvector is missing

This usually happens when the database volume existed before the initialization script was added. Confirm the target database, then enable the extension manually:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Do not delete an existing volume merely to rerun initialization unless you have confirmed that its data is disposable.

### The API starts before PostgreSQL is ready

TypeORM performs three short connection attempts. If the database image is being downloaded or initialized for the first time, wait for the Compose health check to pass and restart the API.

### The liveness endpoint works but readiness fails

That distinction is intentional. It means the NestJS process can serve HTTP traffic but cannot currently use its required database dependency. Check the database container, `DATABASE_URL`, credentials, SSL setting, and pgvector extension.

## 15. What Milestone 1 deliberately does not contain

It is tempting to add entities, corpus tables, embeddings, or agents while setting up the server. We postponed them because they belong to later architectural decisions.

Milestone 1 contains only the stable substrate:

- A reproducible Node.js workspace.
- A compilable and tested NestJS server.
- Explicit environment configuration.
- PostgreSQL 16 with pgvector.
- Separate liveness and readiness signals.
- A verified real database connection.

This clean boundary gives the next milestone a trustworthy place to introduce migrations and curriculum data without mixing infrastructure failures with retrieval behavior.

---

# Milestone 2: Building the Grounded Curriculum Ingestion Pipeline

## Milestone status

The ingestion infrastructure is implemented and verified end to end with both a deterministic integration fixture and a real licence-approved curriculum PDF. Manual searches confirmed that representative curriculum questions retrieve the expected chunks and unrelated questions return no chunks above the selected threshold.

## What this milestone adds

Milestone 2 turns the empty pgvector database into an administratively managed curriculum library:

```text
Administrator
    │
    │ multipart PDF + curriculum/source metadata
    ▼
Protected NestJS upload endpoint
    │
    ├── validate PDF signature, MIME type, extension, and size
    ├── calculate SHA-256 and reject duplicates
    ├── write a temporary file
    ├── create document and ingestion records
    └── enqueue a BullMQ job
              │
              ▼
Redis-backed BullMQ worker
    ├── extract page text
    ├── normalize and chunk text
    ├── generate embeddings in batches
    ├── store chunks in pgvector
    ├── update progress and metrics
    └── remove the temporary PDF
              │
              ▼
Curriculum search endpoint
```

BullMQ is a good fit because upload requests remain short while expensive work continues asynchronously. Redis preserves queued work across application restarts and gives us retries and observable job progress. This follows the queue architecture described in the [NestJS BullMQ documentation](https://docs.nestjs.com/techniques/queues).

## 1. Add the ingestion dependencies

Install the queue, validation, PDF, and embedding packages in the API workspace:

```bash
npm install --workspace api \
  @nestjs/bullmq bullmq ioredis \
  multer class-validator class-transformer \
  pdf-parse openai dotenv

npm install --workspace api --save-dev @types/multer
```

The implementation uses:

- BullMQ and Redis for asynchronous ingestion.
- Multer's in-memory upload handling before controlled temporary storage.
- `class-validator` for multipart metadata validation.
- `pdf-parse` 2.x for page-level text extraction.
- The official OpenAI JavaScript SDK for embeddings.
- TypeORM's native PostgreSQL vector-column support.

## 2. Add Redis to the development stack

Add a Redis service to `compose.yaml`:

```yaml
redis:
  image: redis:7.4.2-alpine
  ports:
    - "6379:6379"
  volumes:
    - stem_tutor_redis:/data
  command: ["redis-server", "--appendonly", "yes"]
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 10
  restart: unless-stopped
```

Append-only persistence makes queued jobs more resilient during local container restarts. Update the root database command so both required datastores start together:

```json
{
  "db:up": "docker compose up -d database redis"
}
```

## 3. Add ingestion configuration

Extend `.env.example`:

```dotenv
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
QUEUE_PREFIX=stem-ai-tutor

ADMIN_INGESTION_KEY=replace-with-a-long-random-value
CORPUS_UPLOAD_DIR=var/corpus-uploads
CORPUS_MAX_FILE_SIZE_BYTES=20971520

CHUNK_MAX_CHARACTERS=2400
CHUNK_OVERLAP_CHARACTERS=300

OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_BATCH_SIZE=50
```

Do not use the placeholder administration key. Generate a long random value locally and place it only in `.env`. The OpenAI key is also server-side only.

Add `var/` to `.gitignore`; queued PDFs are runtime artifacts and must not enter version control.

## 4. Register BullMQ in NestJS

Configure one shared BullMQ connection in `AppModule`:

```ts
BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
    },
    prefix: config.get<string>('QUEUE_PREFIX', 'stem-ai-tutor'),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }),
})
```

The queue retries transient failures three times. Completed and failed job records are bounded so Redis does not grow indefinitely during a public demo.

The queue itself is registered in `CorpusModule`:

```ts
BullModule.registerQueue({ name: 'corpus-ingestion' })
```

## 5. Design the curriculum-library schema

The first explicit TypeORM migration creates five tables:

| Table | Responsibility |
|---|---|
| `corpus_sources` | Title, author, publisher, URL, and licence declaration |
| `curriculum_topics` | Subject, school level, curriculum, code, and topic label |
| `corpus_documents` | Uploaded-file identity, SHA-256, status, and source relationship |
| `ingestion_runs` | BullMQ ID, stage, progress, counts, token usage, and errors |
| `corpus_chunks` | Stable chunk ID, page citation, content, topic, and vector |

The critical vector column is:

```sql
embedding vector(1536) NOT NULL
```

The migration also creates a cosine-search HNSW index:

```sql
CREATE INDEX "IDX_corpus_chunks_embedding_hnsw"
ON "corpus_chunks" USING hnsw ("embedding" vector_cosine_ops);
```

TypeORM supports PostgreSQL `vector` columns and pgvector distance operators directly, as documented in its [PostgreSQL vector-column guide](https://typeorm.io/docs/drivers/postgres/#vector-columns).

Schema synchronization remains disabled. Apply changes explicitly:

```bash
npm run migration:run
```

The migration was applied successfully to PostgreSQL 16.10 with pgvector 0.8.0.

## 6. Protect corpus administration

All corpus routes live under:

```text
/api/admin/corpus
```

An `AdminIngestionKeyGuard` requires this header:

```http
x-admin-ingestion-key: <configured value>
```

The guard:

- Disables administration while the placeholder key is configured.
- Uses constant-time comparison for supplied keys of equal length.
- Returns `401 Unauthorized` for an incorrect key.
- Keeps the public student-facing API separate from corpus management.

This is intentionally a narrow PoC control. A production administration interface would use real identity, roles, audit logs, and secret rotation.

## 7. Accept and validate PDF uploads

The upload route is:

```http
POST /api/admin/corpus/documents
Content-Type: multipart/form-data
```

Required form fields are:

- `file`
- `subject`
- `schoolLevel`
- `curriculum`
- `sourceTitle`
- `licence`

Optional metadata includes author, publisher, source URL, topic label, and topic code.

The PDF validator checks four independent properties:

1. A file was supplied.
2. Its declared MIME type is `application/pdf`.
3. Its name ends in `.pdf`.
4. Its bytes begin with the `%PDF-` signature.

The API also limits uploads to 20 MB. Checking only the extension or browser-provided MIME type would make malformed or misleading uploads too easy.

After validation, the service:

1. Stores the PDF under a generated name outside version control.
2. Calculates its SHA-256 hash.
3. Rejects an existing hash with `409 Conflict`.
4. Creates the source, document, and ingestion records in one transaction.
5. Adds a small serializable job containing only document and ingestion IDs.
6. Returns `202 Accepted`.

Large PDF buffers are never placed in Redis.

## 8. Process ingestion in a worker

The worker extends NestJS `WorkerHost`:

```ts
@Processor('corpus-ingestion', { concurrency: 1 })
export class CorpusIngestionProcessor extends WorkerHost {
  async process(job: Job<IngestionJobData>) {
    return this.ingestionService.process(job.data, async (progress) => {
      await job.updateProgress(progress);
    });
  }
}
```

Concurrency is deliberately one for the PoC. It controls embedding spend and avoids several large PDF parsers competing for memory on a small demonstration server.

The persisted ingestion stages are:

```text
queued → extracting → chunking → embedding → saving → completed
```

Failures are saved with an error message. Transient failures return to `retrying`; the final failed attempt marks both the ingestion and document as failed. Temporary PDFs are removed after success or final failure.

## 9. Extract PDF text by page

`PdfExtractorService` uses the `PDFParse` class from `pdf-parse` 2.x:

```ts
const parser = new PDFParse({
  data: buffer,
  isEvalSupported: false,
  stopAtErrors: true,
});

const result = await parser.getText();
await parser.destroy();
```

Page-level extraction is important because the page number becomes part of every citation. Text is Unicode-normalized, null characters are removed, and excessive whitespace is collapsed.

If fewer than 50 characters can be extracted, ingestion fails with a message explaining that the file may be scanned. OCR is intentionally not hidden behind a weak fallback; scanned documents will be added as a separate capability after a real corpus establishes the need.

## 10. Create stable, page-attributed chunks

The chunker currently uses a maximum of 2,400 characters and 300 characters of overlap. It prefers sentence endings, falls back to whitespace, and never mixes page numbers in a single chunk.

Each chunk contains:

```text
stable chunk ID
document ID
chunk index
page start and end
source locator
content and content hash
estimated token count
topic ID, when supplied
embedding model and dimensions
embedding vector
```

The stable ID is a SHA-256 digest of the document ID, chunk index, page number, and content hash. Reprocessing the same stored document therefore produces the same citation identifiers.

If the upload supplies `topicLabel`, all its chunks are mapped to that topic. If no topic is supplied, chunks remain explicitly unmapped and the ingestion result reports the count. Whole-textbook automatic topic mapping should not be guessed; it will be designed after inspecting the real document structure.

## 11. Generate embeddings behind a provider seam

`OpenAiEmbeddingProvider` implements a small internal interface:

```ts
interface EmbeddingProvider {
  embed(texts: string[]): Promise<{
    embeddings: number[][];
    model: string;
    dimensions: number;
    inputTokens: number;
  }>;
}
```

The production adapter submits batches using `text-embedding-3-small`, requests floating-point vectors, records input-token usage, and validates the returned vector count and dimensions. OpenAI's embedding endpoint accepts arrays of strings and supports an explicit dimensions parameter for `text-embedding-3` models; see the [official embedding API reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create) and [`text-embedding-3-small` model page](https://developers.openai.com/api/docs/models/text-embedding-3-small).

The schema and configuration both use 1,536 dimensions. The application fails at startup if a conflicting dimension is configured, preventing a subtle runtime database error.

The provider is injected through a token rather than referenced directly by ingestion logic. Tests can supply a deterministic provider, and a future locally hosted embedding model can replace OpenAI without rewriting the upload or worker flow.

## 12. Search the grounded library

The protected search endpoint is:

```http
POST /api/admin/corpus/search
```

Example body:

```json
{
  "query": "What is a physical change?",
  "limit": 5,
  "threshold": 0.65,
  "subject": "Basic Science",
  "schoolLevel": "SS1"
}
```

The current service performs hybrid retrieval. It embeds the query for cosine
similarity, runs PostgreSQL full-text matching, and uses `pg_trgm` word
similarity for spelling tolerance. It gathers a wider semantic and lexical
candidate pool, fuses the signals, and only then returns the top-k candidates:

```sql
WITH semantic_candidates AS (
  SELECT id
  FROM corpus_chunks
  ORDER BY embedding <=> $1::vector
  LIMIT $candidate_pool
),
lexical_candidates AS (
  SELECT id, lexical_score
  FROM corpus_chunks
  ORDER BY lexical_score DESC
  LIMIT $candidate_pool
)
SELECT
  chunk.id,
  semantic_similarity,
  lexical_similarity,
  GREATEST(semantic_similarity, lexical_similarity) AS hybrid_score
FROM combined_candidates
ORDER BY hybrid_score DESC
LIMIT $top_k;
```

Thresholding is intentionally not part of this SQL selection. Results include
the chunk ID, content, page/source metadata, semantic similarity, lexical
similarity, fused hybrid score, matching channels, and an `accepted` flag. The
response also includes `acceptedCount` and the best `topCandidate`, even when its
score is below the requested threshold. The tutor orchestrator—not the database
query—owns the final refusal decision.

The `AddHybridCorpusSearch2026072223000` migration enables `pg_trgm` and adds GIN
indexes for English full-text search and lower-cased trigram content matching.

## 13. Expose operational endpoints

The implemented corpus endpoints are:

```text
POST /api/admin/corpus/documents
GET  /api/admin/corpus/documents
GET  /api/admin/corpus/documents/:documentId
GET  /api/admin/corpus/ingestions/:ingestionId
POST /api/admin/corpus/search
```

The general readiness endpoint now verifies BullMQ/Redis as well as the database:

```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "name": "stem_tutor",
    "postgresVersion": "16.10 (Debian 16.10-1.pgdg12+1)",
    "vectorVersion": "0.8.0",
    "trigramVersion": "1.6"
  },
  "queue": {
    "status": "connected",
    "provider": "bullmq",
    "datastore": "redis"
  }
}
```

## 14. Provide a reproducible CLI

The upload endpoint and CLI both call `DocumentUploadService`; there are not two ingestion implementations.

```bash
npm run ingest -- \
  --file /path/to/basic-science.pdf \
  --subject "Basic Science" \
  --school-level SS1 \
  --curriculum NERDC \
  --source-title "Basic Science Text" \
  --licence "CC BY 4.0" \
  --topic-label "Physical and Chemical Changes"
```

The CLI validates metadata, submits the job, and prints persisted progress until completion or failure.

## 15. Verify the complete pipeline

Run the fast checks:

```bash
npm run lint
npm test
npm run build
```

Run the database- and Redis-backed integration suite:

```bash
npm run test:integration
```

The integration test creates a small valid PDF in memory and proves this sequence:

```text
HTTP upload
  → authentication and metadata validation
  → BullMQ job in Redis
  → PDF page extraction
  → stable chunk creation
  → deterministic test embeddings
  → vector insertion in PostgreSQL
  → ingestion completion
  → cosine similarity search
```

The verified result is:

```text
Lint:              passed
Unit tests:        12 passed
Integration tests: 3 passed
Production build:  passed
Migration:         applied successfully
Live readiness:    PostgreSQL, pgvector, and BullMQ/Redis connected
```

The test embedding provider avoids external spending and makes the test repeatable. It does not replace the required real-corpus validation.

## 16. Validate Milestone 2 with real curriculum content

The final operational validation used this sequence:

1. Obtain a text-based, openly licensed curriculum PDF.
2. Record its title, author, publisher, source URL, and exact licence.
3. Add a real `OPENAI_API_KEY` to the local `.env` file.
4. Upload the document through the endpoint or CLI.
5. Confirm all chunks are created and embedded.
6. Inspect page citations and any unmapped chunks.
7. Run representative in-syllabus and out-of-syllabus retrieval questions.
8. Adjust chunking and topic mapping based on observed results.

The approved document was ingested successfully, its page-aware chunks were retrievable, in-syllabus questions returned the expected evidence, and unrelated questions were rejected by the selected similarity threshold. Milestone 2 is complete.

---

# Milestone 3: Building the Multi-Agent Harness

## Milestone status

Milestone 3 is complete. The harness is text-only and deliberately uses deterministic tutor and verifier agents. It proves orchestration, typed boundaries, retrieval, persistence, policies, revisions, refusals, and observability without introducing the final model prompts reserved for Milestone 4.

## What this milestone adds

The new request path is synchronous and remains inside the NestJS process:

```text
POST /api/tutor/runs
        │
        ▼
TutorOrchestratorService
        │
        ├── model-backed query-transformer agent
        │       └── strict structured output (intent + refined query)
        │
        ├── retrieval agent
        │       └── curriculum.search tool
        │               └── CorpusSearchService (direct service call)
        │
        ├── deterministic tutor agent
        │
        ├── deterministic grounding verifier
        │       └── at most one controlled tutor revision
        │
        └── persisted state, ordered events, tool invocations, and metrics
```

BullMQ still owns background PDF ingestion only. Interactive tutoring is a short, ordered workflow that needs an immediate response and shared budget, so adding a queue would create extra state and latency without evidence of a benefit.

## 1. Define one strongly typed run state

The central contract is `TutorRunState` in `api/src/tutor/contracts/tutor-run-state.ts`. It contains:

- Run identity, status, original question, language, and structured query transformation.
- Full structured curriculum chunks and their source metadata.
- Draft and final answers.
- Canonical citations.
- Grounding and refusal decisions.
- Token, estimated-cost, latency, agent-call, tool-call, retry, and revision metrics.
- Ordered trace events and tool-usage records.
- Safe structured errors.
- Created, started, and completed timestamps.

The evidence contract keeps citation data explicit:

```ts
interface CurriculumChunk {
  chunkId: string;
  content: string;
  topic: { id: string | null; label: string | null };
  locator: {
    pageStart: number;
    pageEnd: number;
    sourceLocator: string;
  };
  document: {
    id: string;
    sourceTitle: string;
    sourceAuthor: string | null;
    sourcePublisher: string | null;
    sourceUrl: string | null;
    sourceLicence: string;
    subject: string;
    schoolLevel: string;
    curriculum: string;
  };
  similarity: number;
}
```

This gives later model adapters a stable input without coupling them to TypeORM rows or administrative HTTP response shapes.

## 2. Keep agents behind validated contracts

Agents implement one generic interface:

```ts
interface TutorAgent<TInput, TOutput> {
  readonly name: string;
  execute(
    input: TInput,
    context: AgentContext,
  ): Promise<AgentResult<TOutput>>;
}
```

`AgentResult<TOutput>` includes the output, token and estimated-cost usage, and a safe result summary. The orchestrator validates all of these fields at runtime. A TypeScript type alone is not sufficient because future provider responses enter the application at runtime and can be missing, malformed, or inconsistent.

Agents receive a constrained context containing the run ID, attempt, deadline, abort signal, and tool invoker. They return results instead of receiving a mutable `TutorRunState`; only the orchestrator and persistence boundary can apply state changes. This prevents one agent from silently changing another stage's data.

Dependency-injection tokens select the query transformer, retrieval, tutor, and verifier implementations. Milestone 4 can replace an implementation without changing workflow policy or persistence.

The query-transformer output is deliberately separate from the original question:

```ts
interface QueryTransformerAgentOutput {
  refinedQuery: string;
  intent: 'learn_concept' | 'define_concept' | 'solve_problem' |
    'compare_concepts' | 'explain_process' | 'other';
  concepts: string[];
  corrections: Array<{ original: string; corrected: string }>;
  model: string;
}
```

The original question continues to the tutor and verifier. Only `refinedQuery`
feeds retrieval, preventing a retrieval optimization from silently rewriting the
student's actual request.

## 3. Add the tool registry and `curriculum.search`

Tools follow the same generic pattern:

```ts
interface TutorTool<TInput, TOutput> {
  readonly name: string;
  validateInput(value: unknown): value is TInput;
  validateResult(value: unknown): value is ToolResult<TOutput>;
  execute(
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<ToolResult<TOutput>>;
}
```

`CurriculumSearchTool` is the first real registered tool. It injects and calls `CorpusSearchService` directly, so internal agent traffic never passes through `POST /api/admin/corpus/search` and never needs the administration key.

The tool returns the chunk ID, content, topic, page locator, complete
document/source metadata, semantic similarity, fuzzy/full-text lexical
similarity, fused hybrid score, match channels, and acceptance decision. It also
forwards query-embedding token usage and calculates an estimated embedding cost
from the configurable per-million-token rate.

The tool summary records `candidateCount`, `acceptedCount`, the threshold, and a
structured `topCandidate`. Because top-k selection happens before policy
filtering, a refused run still reports the best rejected chunk ID and all three
scores instead of `topSimilarity: null`.

`ToolRegistryService` centrally handles:

- Tool lookup and input/output validation.
- Per-tool timeout and abort signalling.
- Bounded retries.
- Token and estimated-cost accounting.
- A `tool_invocations` row for every attempt.
- `tool.started`, `tool.completed`, and `tool.failed` trace events.
- Safe summaries rather than raw provider payloads.

## 4. Centralize policy and budget enforcement

`HarnessPolicyService` reads bounded configuration, while a run-local `RunBudget` owns counters. The committed defaults are:

| Setting | Default | Purpose |
|---|---:|---|
| `TUTOR_AGENT_TIMEOUT_MS` | 10000 | Maximum time for one agent attempt |
| `TUTOR_TOOL_TIMEOUT_MS` | 10000 | Maximum time for one tool attempt |
| `TUTOR_MAX_AGENT_CALLS` | 6 | Bound query transformation and all later agent/model calls, including retries |
| `TUTOR_MAX_AGENT_RETRIES` | 1 | Retry limit per agent stage |
| `TUTOR_MAX_TOOL_RETRIES` | 1 | Retry limit per tool call |
| `TUTOR_MAX_TOKENS` | 32000 | Total run token ceiling; accommodates the bounded draft, revision, and two-verification path |
| `TUTOR_MAX_ESTIMATED_COST_USD` | 0.10 | Total estimated-cost ceiling |
| `TUTOR_RETRIEVAL_LIMIT` | 5 | Maximum returned evidence chunks |
| `TUTOR_RETRIEVAL_THRESHOLD` | 0.65 | Minimum accepted fused hybrid score |

The revision maximum is fixed at one in code for this milestone. It is not an environment switch that can accidentally permit an unbounded answer-verification loop.

There is no whole-workflow wall-clock cutoff. The earlier 30-second global
deadline could terminate the final verifier in an otherwise healthy bounded
revision path. Each agent attempt and tool attempt still has its own abortable
timeout, while agent-call, retry, token, cost, and revision ceilings bound the
workflow as a whole.

Citation enforcement also lives centrally. After each tutor result, the orchestrator checks every citation ID against the retrieved set and replaces source labels with canonical metadata from the matching chunk. An unknown ID terminates the run with `UNKNOWN_CITATION` and no final answer.

`CorpusSearchService` always returns ranked top-k candidates before applying the
threshold. The orchestrator filters those candidates using `hybridScore` and
refuses when none are accepted. It deliberately rechecks the numerical score
instead of trusting an adapter's `accepted` flag, ensuring a future tool or test
double cannot smuggle below-threshold evidence into a normal answer.

## 5. Implement the ordered workflow

The orchestrator follows this state machine:

```text
created → running
             │
             ▼
      query transformation
             │
             ▼
         retrieval
          │      │
    no evidence  evidence
          │      │
          ▼      ▼
       refused  tutor draft
                    │
                    ▼
                 verifier
                │        │
           grounded    ungrounded
                │        │
                ▼        ▼
            completed  one revision
                            │
                            ▼
                         verifier
                       │          │
                  grounded     ungrounded
                       │          │
                       ▼          ▼
                   completed    refused
```

Any timeout, exhausted budget, tool failure, agent failure, malformed result, or citation-policy violation moves the run to `failed`, clears the final answer, sets a safe refusal reason, and persists a structured error plus a final trace event.

No path assigns `finalAnswer` before both of these conditions are true:

1. At least one curriculum chunk meets the threshold.
2. The grounding verifier accepts the draft or its single revision.

## 6. Transform conversational queries before deterministic retrieval

`ModelQueryTransformerAgent` calls an OpenAI Responses provider before retrieval.
The provider uses a strict JSON schema, `store: false`, bounded output tokens, and
`reasoning.effort: none`. Its narrow instruction corrects clear spelling mistakes,
removes conversational filler, preserves topic and intent, and forbids answering
the question or inventing facts. For example, `I want to learn about kinetic
energy` can become `kinetic energy definition formula examples`.

`gpt-5.6-luna` is the default because query rewriting is a short, high-volume,
cost-sensitive classification and extraction task. The model and its cost rates
remain configurable:

```dotenv
QUERY_TRANSFORMER_MODEL=gpt-5.6-luna
QUERY_TRANSFORMER_MAX_OUTPUT_TOKENS=300
QUERY_TRANSFORMER_INPUT_COST_PER_MILLION_TOKENS_USD=1.00
QUERY_TRANSFORMER_OUTPUT_COST_PER_MILLION_TOKENS_USD=6.00
```

The provider returns token usage and estimated cost through the normal agent
contract, so the existing run budget applies before retrieval begins. A missing
key, timeout, provider failure, or malformed structured result terminates safely
and remains visible in the trace.

The remaining three implementations exercise the harness without final tutor or
verifier prompts:

- `DeterministicRetrievalAgent` invokes the real `curriculum.search` tool.
- `DeterministicTutorAgent` creates a short answer from the first retrieved curriculum excerpt and cites that chunk.
- `DeterministicGroundingVerifierAgent` checks that the answer is non-empty and all citation IDs belong to the evidence set.

The tutor and verifier report deterministic token estimates with zero model cost.
The retrieval tool reports the real query-embedding token count and a configurable
estimated embedding cost. Automated tests replace both the query transformer and
corpus tool with deterministic providers, so they never call OpenAI.

These agents are scaffolding, not the intended educational behavior. Pedagogy, richer reasoning, multilingual behavior, and real model-backed grounding belong to Milestone 4.

## 7. Persist runs, events, and tool calls

The explicit `CreateTutorHarness2026072222000` migration creates:

| Table | Stored evidence |
|---|---|
| `tutor_runs` | Status, question, language, safe query transformation, retrieved chunk IDs and structured chunks, answers, citations, grounding/refusal decisions, metrics, safe errors, and timestamps |
| `agent_events` | Per-run sequence, event/stage, agent/tool name, status, safe summary, latency, usage, retry, safe error, and timestamp |
| `tool_invocations` | Tool/agent name, input summary, status, result summary, duration, usage, retry, safe error, and start/completion timestamps |

Foreign keys cascade trace and tool rows when a run is deliberately removed. A unique `(run_id, sequence)` constraint protects trace ordering.

`AddQueryTransformation2026072224000` adds a nullable `query_transformation`
JSONB column without rewriting existing runs. The persistence layer stores the
safe structured transformation and model name, but not API keys, raw provider
responses, or hidden instructions. Tool inputs are summarized—for example, query
character count and retrieval options—rather than copied wholesale into logs.

Apply and inspect migrations with:

```bash
npm run migration:run
npm run migration:show
```

The verified migration state is:

```text
[X] 1 CreateCorpusLibrary2026072217000
[X] 2 CreateTutorHarness2026072222000
[X] 3 AddHybridCorpusSearch2026072223000
[X] 4 AddQueryTransformation2026072224000
```

## 8. Expose the text-only API

Create a run:

```bash
curl -X POST http://localhost:3000/api/tutor/runs \
  -H 'content-type: application/json' \
  -d '{"question":"What is a physical change?","language":"en"}'
```

The endpoint is synchronous for Milestone 3 and returns `201 Created` with the complete terminal state. A successful response has this shape:

```json
{
  "runId": "uuid",
  "status": "completed",
  "question": "What is a physical change?",
  "language": "en",
  "queryTransformation": {
    "originalQuery": "What is a physical change?",
    "refinedQuery": "physical change definition and examples",
    "intent": "define_concept",
    "concepts": ["physical change"],
    "corrections": [],
    "model": "gpt-5.6-luna"
  },
  "retrievedChunks": [],
  "draftAnswer": "According to the curriculum: ...",
  "finalAnswer": "According to the curriculum: ...",
  "citations": [{ "chunkId": "...", "sourceTitle": "...", "sourceLocator": "page 4" }],
  "grounding": { "grounded": true, "reasons": [], "checkedCitationIds": ["..."], "revisionRecommended": false },
  "refusal": { "refused": false, "reason": null },
  "metrics": {},
  "toolUsage": [],
  "trace": [],
  "errors": [],
  "createdAt": "...",
  "startedAt": "...",
  "completedAt": "..."
}
```

Fetch the persisted state and complete ordered trace later:

```bash
curl http://localhost:3000/api/tutor/runs/RUN_ID
```

Invalid input is rejected through the global validation pipe. Milestone 3 accepts `en`; additional language behavior should be added together with an agent that can actually honor it.

## 9. Test orchestration without paid calls

The unit suite uses an in-memory run store, fake curriculum tool, deterministic agents, and very short test-specific deadlines. It covers:

- Successful grounded completion.
- Structured query transformation and exact refined-query propagation into retrieval.
- Query-transformer provider usage mapping and safe missing-key failure.
- Empty and below-threshold retrieval refusal.
- Top-k-before-threshold results and rejected-candidate trace diagnostics.
- Semantic, full-text, and typo-tolerant lexical score mapping.
- Exact chunk propagation into the tutor.
- Unknown citation rejection.
- One verifier-driven revision and successful re-verification.
- Repeated grounding failure and refusal.
- Agent timeout.
- Tool timeout and provider failure.
- Malformed structured agent output.
- Token and estimated-cost budget exhaustion.
- Strict trace-event ordering.
- Direct `CorpusSearchService` wrapping and metadata mapping.

The database-backed HTTP suite overrides the query transformer and curriculum
tool with deterministic providers and proves:

- `POST /api/tutor/runs` completes and persists a grounded run.
- `GET /api/tutor/runs/:runId` returns its stored result and trace.
- Agent events and tool invocations exist in PostgreSQL.
- A malformed agent output persists a failed run and safe structured error.
- Existing corpus-ingestion and health behavior still passes.

## 10. Verification evidence

Run the acceptance commands from the repository root:

```bash
npm run migration:run
npm run migration:show
npm run lint
npm test
npm run test:integration
npm run build
```

The verified Milestone 3 result is:

```text
Migration:         applied; all four explicit migrations shown as executed
Lint:              passed
Unit tests:        33 passed
Integration tests: 5 passed
Production build:  passed
External AI calls: none during automated tests
```

The integration count includes the new tutor-harness tests plus the preserved corpus-ingestion and health HTTP tests.

## 11. Troubleshooting

### A live tutor request says the query transformer is not configured

The query transformer and retrieval embedding provider both use
`OPENAI_API_KEY`. Configure it on the server before making a live request. Tests
override both boundaries and make no external call.

### A run fails during query transformation

Inspect the `query-transformation` agent event. Provider timeouts and transient
failures follow the configured agent retry policy. A missing key or invalid
structured output fails closed; retrieval never runs with an unvalidated rewrite.
The original question is always preserved in `tutor_runs.question`.

### A question returns a refusal even though the corpus contains related text

Inspect the `curriculum.search` tool summary. It retains the best candidate even
when the run refuses, including `semanticSimilarity`, `lexicalSimilarity`,
`hybridScore`, and `accepted`. Lowering the hybrid threshold trades precision for
recall and should be based on both in-syllabus and unrelated evaluation questions.

For the real stored corpus, the misspelled query `what is kinectic energy?`
returned page 465 first. Its measured semantic similarity was approximately
`0.471`, typo-tolerant lexical similarity was approximately `0.773`, and the
fused hybrid score was approximately `0.773`, so it cleared the existing `0.65`
policy without lowering the threshold.

### The API reports `UNKNOWN_CITATION`

The tutor adapter returned a chunk ID that retrieval did not supply. Do not bypass this check. Fix the adapter so it cites only the structured chunks in its input.

### A run fails with `AGENT_TIMEOUT` or `TOOL_TIMEOUT`

Check the individual event and tool durations before increasing limits. The
effective deadline for a tool is the smaller of its configured tool timeout and
its containing agent deadline. There is deliberately no whole-run duration
setting; bounded calls, retries, budgets, and the single revision prevent an
unbounded workflow.

### Token or cost budgets fail unexpectedly

Inspect aggregate metrics plus the usage on agent events and tool invocations.
Keep both query-transformer input/output rates and
`TUTOR_EMBEDDING_COST_PER_MILLION_TOKENS_USD` synchronized with current provider
pricing. Cost values are estimates and policy controls, not billing records.

### Integration tests cannot connect to PostgreSQL or Redis

Start both local services and confirm their health:

```bash
npm run db:up
docker compose ps
```

Then apply migrations before rerunning `npm run test:integration`.

## 12. What Milestone 3 deliberately does not contain

This milestone does not add production tutor/verifier prompts, model-backed
tutor/verifier behavior, ASR, TTS, browser audio, a frontend, or interactive
stages on BullMQ. The query transformer is intentionally narrow and exists only
to improve retrieval input. The harness still makes later components enter
through typed, budgeted, observable, and testable boundaries.

Milestone 4 can now focus on answer quality and grounding behavior because the harness already guarantees evidence gating, citation ownership, controlled revision, persistence, and safe failure.

---

# Milestone 4: Building the Grounded Text Tutor

## Milestone status

Milestone 4 is complete. The deterministic tutor and verifier scaffolding have
been replaced in the production dependency graph by real provider-backed agents.
The milestone remains English text-only. Retrieval, orchestration, policies,
persistence, endpoints, and the one-revision state machine still use the
Milestone 3 boundaries.

The interactive workflow is now:

```text
original student question
        │
        ▼
model query transformation ── refined query only ──► deterministic retrieval
                                                        │
                                                        ▼
                                              accepted curriculum chunks
                                                        │
                                                        ▼
                                              model-backed tutor draft
                                                        │
                                                        ▼
                                        independent model grounding verifier
                                           │                         │
                                      grounded                 ungrounded
                                           │                         │
                                           ▼                         ▼
                                       complete          at most one guided revision
                                                                     │
                                                                     ▼
                                                          verify once more, then
                                                          complete or safe refusal
```

BullMQ still handles background PDF ingestion only. The interactive tutor
workflow remains synchronous and in-process.

## 1. Reuse the Milestone 3 extension points

The production switch uses the existing `TUTOR_AGENT` and
`GROUNDING_VERIFIER_AGENT` dependency-injection tokens. The orchestrator still
depends on `TutorAgent<TInput, TOutput>` rather than provider-specific classes.

Two new agent adapters implement that interface:

- `ModelTutorAgent` converts a strict tutor-provider result into
  `AgentResult<TutorAgentOutput>`.
- `ModelGroundingVerifierAgent` converts an independent verifier-provider result
  into `AgentResult<GroundingVerifierOutput>`.

The adapters validate provider data again before returning it. Only the
orchestrator mutates `TutorRunState`; provider clients never receive a mutable
run object or persistence repository.

The workflow contracts were extended rather than replaced:

- The tutor receives the original question, the validated query transformation,
  accepted chunks, and optional revision feedback.
- Tutor output adds an answer summary, an explicit `insufficientEvidence`
  decision, and a nullable limitation.
- Verification input states whether the draft is initial or revised and whether
  revision remains available.
- Grounding output adds safe revision guidance and unsupported-claim summaries.

These additions fit the existing JSONB run and trace columns. No Milestone 4
database migration is required, and old Milestone 3 rows remain readable.

## 2. Keep provider transport behind a narrow client

`OpenAiModelResponseClient` is the only new class that speaks directly to the
OpenAI Responses API. Tutor and verifier providers depend on a small internal
`ModelResponseClient` contract, so unit tests can inject a deterministic client
without network access or paid calls.

Every request uses:

```ts
{
  store: false,
  max_output_tokens: configuredLimit,
  reasoning: { effort: 'low' },
  text: {
    format: {
      type: 'json_schema',
      name: schemaName,
      strict: true,
      schema,
    },
  },
}
```

The shared transport forwards the orchestrator's `AbortSignal`. The agent
context also carries the effective per-attempt deadline derived from the agent
timeout. Raw responses, prompts, provider errors, and credentials are never
logged or persisted.

The implementation follows the official
[Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs),
which documents `text.format` with a strict JSON schema for Responses API output.
Application validation remains necessary because schema-shaped content can still
be semantically contradictory.

## 3. Configure tutor and verifier independently

The query-transformer configuration is unchanged. Tutor and verifier settings
are separate:

```dotenv
TUTOR_MODEL=gpt-5.6-terra
TUTOR_MAX_OUTPUT_TOKENS=1200
TUTOR_INPUT_COST_PER_MILLION_TOKENS_USD=2.50
TUTOR_OUTPUT_COST_PER_MILLION_TOKENS_USD=15.00

GROUNDING_VERIFIER_MODEL=gpt-5.6-terra
GROUNDING_VERIFIER_MAX_OUTPUT_TOKENS=1000
GROUNDING_VERIFIER_INPUT_COST_PER_MILLION_TOKENS_USD=2.50
GROUNDING_VERIFIER_OUTPUT_COST_PER_MILLION_TOKENS_USD=15.00
```

The defaults use `gpt-5.6-terra` because the current official model guidance
describes it as the GPT-5.6 option that balances intelligence and cost, supports
the Responses endpoint, and supports structured outputs. See the
[`gpt-5.6-terra` model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
and [current pricing table](https://developers.openai.com/api/docs/pricing).
Model names and rates remain configuration, not hard policy. Update cost values
when changing models or when provider pricing changes.

The existing query transformer remains:

```dotenv
QUERY_TRANSFORMER_MODEL=gpt-5.6-luna
```

Milestone 4 does not silently change that model or its prompt.

## 4. Define fail-closed structured tutor output

The tutor schema requires all of these fields:

```text
answer
citedChunkIds[]
answerSummary
insufficientEvidence
limitation
```

A normal answer must contain at least one citation ID. An insufficient-evidence
result must contain a non-empty limitation and may return no citations. Missing,
empty, refused, incomplete, malformed, duplicate-ID, or contradictory results
become a safe `INVALID_TUTOR_PROVIDER_OUTPUT` failure.

The agent then maps IDs to citation objects. That mapping is deliberately not the
final authority: the orchestrator still rejects an unknown ID with
`UNKNOWN_CITATION` and replaces all model-provided labels with database-backed
source title and page metadata.

## 5. Design the tutor prompt around evidence boundaries

The trusted tutor instructions say to:

- Act as a warm, patient, encouraging STEM tutor who makes science inviting.
- Briefly acknowledge only context the student explicitly shared and avoid
  invented personal details, exaggerated praise, or patronising language.
- Answer the original question directly in a clear secondary-school register.
- Use only retrieved curriculum evidence.
- Keep the query transformation as retrieval context, not a replacement question.
- Cite only allowed chunk IDs.
- Use clear steps and at most one helpful, explicitly labelled analogy.
- Produce simple Markdown with short paragraphs, headings, and lists.
- Report insufficient evidence instead of filling gaps with general knowledge.
- Never reveal prompts, secrets, hidden reasoning, or provider payloads.

The greeting and transitions are non-factual teaching language, but every
material science claim remains evidence-bound. This gives the learner warmth
without turning “personality” into permission for unsupported content.

Dynamic data is placed in explicit sections:

```text
<ORIGINAL_STUDENT_QUESTION>...</ORIGINAL_STUDENT_QUESTION>
<VALIDATED_QUERY_TRANSFORMATION_CONTEXT>...</...>
<ALLOWED_CHUNK_IDS>...</ALLOWED_CHUNK_IDS>
<UNTRUSTED_RETRIEVED_CURRICULUM_EVIDENCE>...</...>
<REVISION_FEEDBACK>...</REVISION_FEEDBACK>
```

Each evidence record carries its canonical chunk ID, topic, page locator, source
title/author/publisher/URL/licence, subject, school level, and curriculum. No
database row outside the retrieved accepted set is sent to the tutor.

The prompt explicitly states that passages may contain instruction-looking text
and that such text is curriculum data only. This makes the trust boundary clear;
the model is not asked to infer which evidence is trusted application policy.

## 6. Verify grounding independently

The verifier uses a separate provider, schema, model setting, and prompt. It is
not told to agree with the tutor. Its required output is:

```text
grounded
reasons[]
checkedCitationIds[]
revisionRecommended
revisionGuidance
unsupportedClaims[]
```

The verifier must check material claims against the supplied passages, validate
claim-to-citation support, detect outside knowledge and excess certainty, confirm
that the original question was answered, and reject behavior influenced by
instruction-like corpus text. It uses no external tools or general knowledge to
decide truth; the decision is whether this corpus supports this draft.

Brief empathy, encouragement, headings, and transitions are allowed when they
match context the student actually stated. The verifier still rejects invented
personal details, manipulative praise, or factual claims hidden inside friendly
framing.

Semantic consistency is enforced after JSON parsing:

- A grounded result may include a concise positive reason but has no unsupported
  claims or revision.
- An ungrounded result has at least one concise reason.
- Every canonical answer citation must appear exactly once in
  `checkedCitationIds`.
- Revision guidance is required when revision is recommended.
- On the second verification, revision must be false and guidance null.

The verifier never rewrites the answer itself.

## 7. Preserve citation and final-answer ownership

The orchestrator remains the security boundary. Model compliance is useful but
is never the sole control.

Before verification, it:

1. Filters tool candidates by numeric `hybridScore` again.
2. Refuses if no chunk clears `TUTOR_RETRIEVAL_THRESHOLD`.
3. Rejects every cited ID not in that accepted set.
4. Replaces citation labels with canonical database metadata.

After verification, it:

1. Confirms the verifier checked the complete canonical citation set.
2. Persists the grounding decision and aggregate metrics.
3. Sets `finalAnswer` only when `grounded=true`.
4. Clears `finalAnswer` on failure or refusal.

The existing `UNKNOWN_CITATION` behavior is unchanged.

## 8. Keep the revision path bounded

The first ungrounded verifier result can recommend one revision. The tutor then
receives the previous answer, concise reasons, explicit guidance, and unsupported
claim summaries. It receives the same original question, query context, and
retrieved chunks; revision cannot broaden the evidence set.

If the verifier rejects without recommending revision, the run refuses
immediately. If the revised answer remains ungrounded, the run refuses. The
hard-coded `maxRevisions: 1` policy still prevents reflection loops.

Token usage, estimated cost, latency, calls, retries, and revisions accumulate in
the same `RunBudget`. Each agent attempt has its own ordered start/completion or
failure events. The persisted trace therefore reproduces both verification
attempts and the revision boundary.

## 9. Preserve refusal and safe-failure behavior

There are now four distinct refusal paths:

- Retrieval returns no candidates.
- All candidates remain below the hybrid threshold.
- The tutor explicitly reports insufficient evidence.
- Grounding fails terminally, with or without the single revision.

The first two paths never call the tutor or verifier. An out-of-syllabus request
therefore cannot fall through to a general-knowledge model answer.

Configuration absence, provider exceptions, timeouts, malformed output, unknown
citations, and exhausted budgets are failures rather than normal refusals. They
persist only safe error codes/messages. Raw provider payloads and thrown error
details do not enter `tutor_runs` or `agent_events`.

## 10. Account for tokens and estimated cost

Both providers map `input_tokens` and `output_tokens` from the Responses API into
the existing `AgentResult` usage object. Estimated cost is:

```text
(input tokens × configured input rate
 + output tokens × configured output rate) / 1,000,000
```

The run budget adds query transformation, retrieval embeddings, tutor drafts,
verifier calls, and any revision. Crossing `TUTOR_MAX_TOKENS` or
`TUTOR_MAX_ESTIMATED_COST_USD` fails before a final answer can be assigned. These
figures are policy estimates, not provider invoices.

The token ceiling counts repeated input as well as generated output. Retrieved
chunks are therefore counted again when they are supplied to the tutor,
verifier, revision, and final verifier. The original 16,000-token setting could
reject a valid five-chunk run on its final verification attempt; the default was
raised to 32,000 while retaining the independent $0.10 cost ceiling, six-agent
call ceiling, timeouts, retry limits, and single revision.

## 11. Test without external model calls

Automated tests inject deterministic response clients and provider/agent fakes.
They cover:

- Grounded model-backed answers and multiple citations.
- Unknown citation rejection and canonical label replacement.
- Malformed, empty, incomplete, refused, and contradictory structured output.
- Tutor and verifier timeouts, provider failures, bounded retries, and missing key.
- Empty and below-threshold retrieval without downstream model calls.
- Tutor-declared insufficiency.
- Unsupported claims, revision guidance, successful re-verification, and terminal
  repeated grounding failure.
- Token and estimated-cost limits plus usage aggregation across revision.
- Ordered traces and safe persisted error summaries.
- Instruction-like text inside evidence remaining inside the untrusted evidence
  delimiter without changing allowed IDs or provider behavior.
- `store: false`, strict schema fields, bounded output tokens, and abort forwarding
  at the shared OpenAI client boundary.

No automated test uses a real API key or makes a paid request.

## 12. Database impact

No new migration was created. The existing `tutor_runs.grounding` JSONB value can
store revision guidance and unsupported claims, while `agent_events.summary`
stores safe answer summaries and provider model names. Existing run, event, and
tool tables already contain all required metrics and errors.

`synchronize` remains false. Migration verification continues to show the same
four explicit migrations.

## 13. Live corpus validation

A usable server-side key and the already ingested curriculum allowed the live
smoke pass to run. Credentials and raw provider responses were never printed or
copied into traces. The successful runs were:

| Question | Evidence and result | Total tokens | Cost estimate | Run latency |
|---|---|---:|---:|---:|
| What factors affect the speed of sound in a material? | Grounded; Basic Science Text page 184; cited hybrid score 0.6779 | 6,747 | $0.020574 | 12,206 ms |
| What causes resistance in an electric circuit? | Grounded; pages 304, 305, and 326; cited scores 0.8295, 0.7560, and 0.7482 | 8,050 | $0.025633 | 10,554 ms |
| What happens during a physical change in matter? | Grounded; pages 229 and 230; cited scores 0.8667 and 0.8222 | 7,142 | $0.022302 | 8,151 ms |
| What is the kinectic energy formula? | The transformer corrected `kinectic` to `kinetic`; grounded with pages 471 and 470; cited scores 0.7667 and 0.7417 | 6,317 | $0.020540 | 9,493 ms |

All four answers addressed the original question, used canonical database
citations, passed independent verification, and required no revision. Their
ordered traces recorded separate transformer, retrieval, tutor, and verifier
latencies. For example, the resistance run recorded 1,543 ms, 3,696 ms,
2,683 ms, and 2,486 ms respectively.

The corpus also exposed a useful evidence-coverage boundary. For “What is
kinetic energy?”, the top retrieval score was 0.8542, but the passages did not
explicitly define the term. The tutor returned insufficient evidence, so the
run refused with `finalAnswer: null` after 3,367 tokens and an estimated
$0.011203 rather than completing from general knowledge.

The developer environment initially had a local, uncommitted
`TUTOR_RETRIEVAL_THRESHOLD=0`. That file was preserved. The acceptance server
was restarted with the documented `0.65` threshold for the out-of-syllabus
gate. “Who is the current president of Brazil?” and “How do I bake a chocolate
cake?” had top candidate scores of 0.5952 and 0.6333. Both produced zero
accepted chunks, no tutor or verifier calls, `finalAnswer: null`, and the safe
retrieval-threshold refusal. This also demonstrates why local overrides must be
checked before interpreting a smoke result.

Persisted GET validation reproduced both a completed three-citation run and a
threshold refusal. Status, answer/refusal, retrieved chunks, grounding data,
metrics, and contiguous trace sequence numbers matched the POST results. There
is no pending external-validation gate for Milestone 4.

## 14. Verification evidence

Run from the repository root:

```bash
npm run migration:run
npm run migration:show
npm run lint
npm test
npm run test:integration
npm run build
curl http://localhost:3000/api/health
```

The final acceptance pass completed successfully on 23 July 2026:

- `migration:run` reported no pending migrations, and `migration:show` listed
  all four Milestone 1–3 migrations as applied. Milestone 4 needed no migration.
- ESLint passed.
- All 57 unit tests in 15 suites passed.
- All 5 integration tests in 3 suites passed against PostgreSQL and Redis.
- The Nest production build passed.
- `/api/health` returned `ok` with PostgreSQL 16.10, pgvector 0.8.0,
  `pg_trgm` 1.6, and Redis/BullMQ connected.

Together with the live results above, these checks mark Milestone 4 complete.

## 15. Troubleshooting

### `TUTOR_NOT_CONFIGURED` or `GROUNDING_VERIFIER_NOT_CONFIGURED`

Configure `OPENAI_API_KEY` on the server and restart the API. Do not expose the
key to a browser client. Automated tests should continue to override the provider
boundary instead of using the key.

### `INVALID_TUTOR_PROVIDER_OUTPUT`

The provider returned missing, malformed, empty, refused, incomplete, or
contradictory tutor output. Inspect the safe event code and model configuration;
do not log the raw response to diagnose production traffic.

### `INVALID_GROUNDING_VERIFIER_OUTPUT`

The verifier output was malformed or contradicted workflow state—for example, it
did not check every citation or requested another revision after exhaustion.

### A supported question is refused

Inspect retrieval first. If accepted chunks exist, inspect the tutor limitation
and verifier reasons. Improve corpus coverage or chunking before weakening the
grounding or citation policy.

### Token or cost limits trigger during revision

All attempts accumulate. Compare the per-event usage, configured model rates,
retrieval limit, and output-token caps. Do not exclude failed or revised stages
from the central budget merely to make a run complete.

## 16. What Milestone 4 deliberately excludes

Milestone 4 does not implement voice input, ASR, TTS, browser recording, a
frontend, SSE trace presentation, Yoruba or Hausa behavior, student accounts,
stored personal data, adaptive pedagogy, progress tracking, teacher dashboards,
final seminar evaluation fixtures, deployment, or screenshots. Those remain
separate milestones so text grounding can be evaluated before adding new input,
output, identity, or presentation layers.

---

# Milestone 5: Building the Voice and Trace Interface

## Milestone status

Milestone 5 is complete for the defined English P0 proof of concept. A student
can record or type a question, edit and explicitly confirm the transcript, watch
persisted tutor stages arrive, inspect retrieved curriculum evidence and
citations, and listen to an AI-generated rendering of a completed grounded
answer. A refusal is visually distinct and is never sent to speech synthesis.

The milestone reuses the Milestone 4 tutor unchanged. Voice is an input/output
shell around the existing evidence, citation, verification, refusal, persistence,
and budget boundaries; it is not a second route around them.

## 1. Define the trust boundaries before the UI

The end-to-end path is:

```text
browser MediaRecorder
        │ bounded multipart audio
        ▼
Nest ASR boundary ──► OpenAI transcription
        │ editable transcript + metrics-only voice session
        ▼
explicit student confirmation
        │ question + voiceSessionId
        ▼
existing tutor orchestrator
        │ persisted event, then SSE presentation
        ├──► query transform
        ├──► curriculum retrieval
        ├──► tutor
        └──► independent grounding verifier
        │
        ├── refusal/failed ──► text-only terminal state
        │
        └── completed + grounded
                  │ runId only
                  ▼
          Nest TTS boundary
                  │ canonical finalAnswer only
                  ▼
      deterministic Markdown cleanup ──► OpenAI speech
                  ▼
          disclosed browser audio controls
```

Three decisions prevent convenience features from weakening Milestone 4:

1. The browser never receives an OpenAI key and never calls a provider directly.
2. ASR output is never auto-submitted. The transcript remains a normal editable
   textarea and requires a separate confirmation checkbox.
3. The speech endpoint accepts a run ID, not text. The server loads the row and
   requires `status = completed`, a non-refusal, a final answer, and
   `grounding.grounded = true` before sending a content-preserving plain-text
   presentation of that answer to TTS.

## 2. Add the browser workspace

The root npm workspace now contains `api` and `web`. The browser package uses
React, TypeScript, Vite, Vitest, Testing Library, and ESLint. Root commands build,
test, lint, and develop both packages, while focused commands remain available:

```bash
npm run build:api
npm run build:web
npm run test:api
npm run test:web
```

`npm run start:dev` runs Nest and Vite together. Vite reads the repository-root
environment file and proxies `/api` to `http://localhost:3000` in development.
`VITE_API_ORIGIN` can select a deployed API origin, but it must never contain a
credential. Nest CORS uses the explicit comma-separated `WEB_ORIGINS` allowlist
instead of a wildcard.

## 3. Capture short recordings safely

`useRecorder` owns the `MediaRecorder` lifecycle. Microphone access starts only
after a button press. It negotiates among browser-supported WebM, MP4, and Ogg
recordings, caps the recording using `VOICE_MAX_RECORDING_SECONDS`, and stops
every `MediaStreamTrack` on normal stop, error, automatic timeout, or component
unmount.

The client handles:

- Unsupported `MediaRecorder` or `getUserMedia`.
- Microphone permission denial.
- Recorder runtime failure.
- Empty recordings.
- Stop and cleanup on navigation/unmount.

Every failure keeps typed input usable. Recording state is presented with text,
not color alone, and the record control exposes `aria-pressed`.

## 4. Validate audio at the server boundary

`POST /api/voice/transcriptions` accepts one in-memory multipart `audio` field
plus `language` and `durationMs`. The request passes through four bounded layers:

- Multer's hard 25 MB ceiling prevents an unexpectedly large body from being
  buffered before application validation.
- The lower configurable `VOICE_MAX_AUDIO_BYTES` application ceiling defaults
  to 8 MB.
- The English P0 duration defaults to 30 seconds and has a hard configuration
  ceiling of 120 seconds.
- MIME type, filename extension, and magic-byte signatures are checked for
  supported WebM, Ogg, WAV, MP3, MP4/M4A, and FLAC inputs.

Missing, empty, unsupported, malformed, oversized, and overlong input returns a
bounded 4xx response. ASR timeouts become a safe gateway timeout. Provider
details are not returned or logged. An in-memory per-IP limiter defaults to ten
ASR requests per minute and is configurable for the single-process P0.

The adapter uses the official OpenAI SDK and the explicit
`gpt-4o-mini-transcribe-2025-12-15` snapshot. It sends the known ISO language
code and keeps the upload in memory. The service returns only the normalized
transcript and stage metadata.

OpenAI's current [speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
documents the transcription endpoint, supported input types, language hints,
and provider 25 MB upload limit. The application intentionally selects a lower
default.

## 5. Persist useful voice metrics, not audio

Migration `2026072310000-AddVoiceMetrics.ts` creates:

```text
voice_sessions
├── id
├── language
├── asr_metrics JSONB
├── tts_metrics JSONB
├── created_at
└── updated_at

tutor_runs
└── voice_session_id UUID UNIQUE NULL
        └── FK voice_sessions(id), ON DELETE SET NULL
```

The application does not create an audio-blob column and never writes recording
or speech bytes to the filesystem or database. `asr_metrics` stores model,
latency, supplied recording duration, MIME type, estimated cost, and pricing
version. `tts_metrics` stores model, voice, format, latency, character count,
estimated duration/cost, and pricing version.

A successful transcription creates a metrics-only voice session. The confirmed
tutor request may claim that session once. Typed questions remain first-class:
if a typed run later receives speech, the service creates a TTS-only voice
session and links it to the run.

Cost fields are explicitly estimates. The configured acceptance values use
$0.003 per ASR minute and $0.015 per estimated TTS minute, versioned
`2026-07-23`. They are seminar observability values, not an attempt to reconstruct
the provider invoice.

## 6. Stream only events that already exist

The synchronous `POST /api/tutor/runs` contract remains available. The browser
uses `POST /api/tutor/runs/stream`, which returns `text/event-stream`.

The orchestrator now accepts an optional observer and abort signal. Each trace
record follows this order:

```text
perform bounded stage
    → append event to PostgreSQL
        → notify observer
            → format SSE event
                → browser renders progress
```

Presentation cannot become the source of truth. Observer failures do not alter
the tutor outcome. A client disconnect aborts in-flight agents and tools, writes
a safe `CLIENT_DISCONNECTED` terminal failure when possible, clears the heartbeat,
and removes the response listener.

An explicit `retrieval.completed` checkpoint is emitted after retrieved chunks
are stored. The browser responds by fetching `GET /api/tutor/runs/:runId`, so the
evidence panel displays canonical database state rather than reconstructing
chunks from event summaries. It fetches again after a terminal event for the
same reason.

SSE responses disable intermediary transformation and buffering, send periodic
heartbeats, preserve event sequence IDs, and close cleanly. The old GET endpoint
therefore remains the complete replay and recovery path.

## 7. Present the trace as a learning artifact

The interface uses a focused single-page layout rather than a general dashboard.
It presents:

- Record, upload, transcription, retrieval, tutor, verifier, synthesis, and
  terminal states.
- Persisted trace entries with stage, agent/tool, status, latency, token count,
  estimated cost, and safe error code.
- Retrieved chunk ID, topic, curriculum/document metadata, hybrid score, excerpt,
  and source locator.
- The final answer rendered from safe Markdown as real headings, paragraphs,
  emphasis, and lists, plus canonical citations.
- A prominent refusal panel with “NO GROUNDED ANSWER GENERATED”.
- ASR, tutor, and TTS latency/cost metrics plus total observed latency and tutor
  token usage.

The layout is responsive, keyboard-operable, readable at narrow widths, and
honors reduced-motion preferences. Status changes use live regions; inputs have
visible labels; focus styles are preserved; and color is never the only state
indicator.

## 8. Keep speech subordinate to grounding

`POST /api/tutor/runs/:runId/speech` has no request body. `SpeechService` reads
the run and rejects:

- Unknown runs.
- Running or failed runs.
- Refusals.
- Missing final answers.
- Ungrounded final answers.
- Answers beyond the configurable provider input ceiling.

Only the canonical `finalAnswer` can feed this route. Immediately before the
provider call, a deterministic presentation transform removes Markdown headings,
emphasis, list markers, code delimiters, and link destinations while preserving
their readable text. This prevents symbols such as `###` and `**` from being
spoken and cannot add new claims. The stored and displayed canonical answer is
unchanged.

The adapter uses `gpt-4o-mini-tts-2025-12-15`, the `cedar` voice, and MP3 by
default. Its delivery instructions ask for a warm, patient, conversational STEM
tutor voice with natural pauses and no theatrical or patronising tone. The
model, voice, format, timeout, plain-text input ceiling, rate limit,
character-rate estimate, pricing estimate, and pricing version all remain
configuration.

The binary response uses `no-store`, `nosniff`, a precise content type, and
metrics headers. The client creates a temporary object URL, uses native audio
controls, never auto-plays, clearly labels the output **AI-generated speech**,
and revokes the URL when it is replaced or the component unmounts. A TTS failure
leaves the written answer and citations visible.

OpenAI's current [text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)
documents the speech endpoint, available voices/formats, and the requirement to
disclose that the voice is AI-generated.

## 9. Data handling and provider retention

Application policy is intentionally narrower than the provider boundary:

- Raw microphone and generated speech bytes are transient in memory.
- No audio is stored by this application.
- Transcript text is persisted because it becomes the tutor question.
- Run, evidence, citations, safe events, stage models, latency, tokens, and
  estimated costs are persisted for seminar observability.
- Raw provider failures and credentials are excluded from logs and traces.

OpenAI's current [API data controls guide](https://developers.openai.com/api/docs/guides/your-data)
states that API data is not used to train models unless an organization opts in.
It lists transcription with no abuse-monitoring or application-state retention,
and speech with no application-state retention but default abuse-monitoring
retention of up to 30 days; both endpoints are eligible for Zero Data Retention.
Those provider controls are organization-level deployment decisions and are not
misrepresented as guarantees made by this repository.

## 10. Error and concurrency behavior

The UI and API make failure states explicit:

- Recording, upload, ASR, tutor, and TTS have separate state labels.
- A transcription never starts a tutor request automatically.
- Input editing invalidates prior confirmation.
- Submit is disabled while a run is active; the handler also uses an in-flight
  guard to prevent fast duplicate requests.
- New recordings abort the prior ASR request.
- New tutor submissions abort the prior stream.
- Browser disconnect propagates through orchestrator agents and tools.
- Rate limits return safe 429 responses.
- Provider timeout/failure messages contain no raw upstream body.
- Refusals never call TTS.

This is deliberately a single-process P0 limiter. A distributed deployment would
move counters to Redis and add authentication-aware quotas.

## 11. Deterministic automated coverage

Automated tests replace ASR, TTS, tutor, verifier, and retrieval providers. They
make no paid call and cover:

- Valid, missing, empty, malformed, unsupported, oversized, and overlong audio.
- ASR provider failure, timeout, metadata persistence, and absence of audio bytes.
- Canonical-answer TTS, typed-origin voice sessions, overlong output, refusal,
  failed/running/ungrounded/unknown runs, provider failure, timeout, and
  deterministic Markdown-to-speech cleanup.
- Persisted progress arriving before terminal SSE, disconnect cancellation, and
  listener cleanup.
- Orchestrator observer ordering and cancellation.
- Typed fallback, editable transcript confirmation, live trace, evidence cards,
  citations, safe Markdown lesson rendering, grounded answer, refusal, TTS
  degradation, and duplicate prevention.
- MediaRecorder MIME negotiation, permission denial, unsupported browsers, and
  microphone-track cleanup.
- A PostgreSQL-backed HTTP sequence covering multipart transcription, voice
  session linkage, the grounded tutor, canonical TTS, response headers, and
  persisted combined metrics.

The browser test setup requires explicit DOM cleanup after each case. Without it,
previously mounted applications remain queryable and create misleading
“multiple elements” failures. The fix belongs in shared test isolation rather
than weakening individual accessibility queries.

## 12. Acceptance evidence

The final deterministic acceptance pass, including the persona, presentation,
and bounded reinforcement refinements on 24 July 2026, produced:

- ESLint: API and web passed with zero warnings.
- API unit tests: 94 tests in 23 suites passed.
- Browser tests: 11 tests in 2 files passed.
- Integration tests: 7 tests in 3 suites passed against PostgreSQL and Redis.
- Migration verification: all six migrations applied, including
  `AddReinforcementLearning2026072412000`.
- Production builds: Nest and the Vite TypeScript/bundle build passed.
- Health: PostgreSQL 16.10, pgvector 0.8.0, `pg_trgm` 1.6, and Redis/BullMQ
  reported connected.

A narrow paid provider smoke pass was also run through the server boundary with
credentials kept server-side:

| Stage | Model | Result | Latency | Estimated cost |
|---|---|---|---:|---:|
| TTS | `gpt-4o-mini-tts-2025-12-15` | HTTP 201, `audio/mpeg`, 360,192 non-empty bytes | 5,261 ms | $0.00703575 |
| ASR | `gpt-4o-mini-transcribe-2025-12-15` | Non-empty 394-character English transcript from the temporary generated sample | 2,344 ms | $0.00140715 |

The temporary MP3, response headers, and local ASR response file were deleted
after validation. No raw transcript, provider response, or credential was added
to the tutorial. Provider usage values remain estimates.

No real-microphone manual browser session or screenshot was claimed during this
terminal-based acceptance because this environment exposes no interactive
browser or microphone. Browser lifecycle, accessibility, and failure paths were
verified deterministically; a real-device demo rehearsal remains an honest
pre-seminar check rather than a hidden completion claim.

## 13. Configuration reference

Voice and browser configuration is documented in `.env.example`:

```text
WEB_ORIGINS
VITE_API_ORIGIN
VOICE_MAX_AUDIO_BYTES
VOICE_MAX_RECORDING_SECONDS
ASR_MODEL
ASR_DEFAULT_LANGUAGE
ASR_TIMEOUT_MS
ASR_REQUESTS_PER_MINUTE
ASR_COST_PER_MINUTE_USD
TTS_MODEL
TTS_VOICE
TTS_FORMAT
TTS_TIMEOUT_MS
TTS_REQUESTS_PER_MINUTE
TTS_MAX_INPUT_CHARACTERS
TTS_ESTIMATED_CHARACTERS_PER_SECOND
TTS_COST_PER_MINUTE_USD
VOICE_PRICING_VERSION
SSE_HEARTBEAT_INTERVAL_MS
```

The application enforces provider-independent hard ceilings of 25 MB for the
multipart buffer and 120 seconds for configured recording duration, even if an
environment value is accidentally made less conservative.

## 14. Troubleshooting

### Recording is unavailable

Use `localhost` or HTTPS, check browser microphone permission, and confirm
`MediaRecorder` support. Typed input is always available.

### The transcript cannot be submitted

Edit the transcript if needed, then check the explicit review confirmation.
Changing text clears the confirmation by design.

### The evidence panel appears after a trace event

That is expected. The event is persisted first, then the client fetches canonical
run state. Do not embed full evidence content in an SSE summary to make the panel
appear earlier.

### Speech returns 409

Fetch the run. Speech requires `completed`, `grounded: true`, a non-refusal, and
a canonical answer under the configured character ceiling.

### Speech fails after the answer succeeds

Keep the written answer visible. Check the safe status, timeout, configured model,
and server key. Do not retry automatically in a loop or expose the provider body.

### Markdown symbols appear or are spoken

Restart both Nest and Vite after updating. The browser must render `finalAnswer`
through the safe Markdown component, while the speech service must pass the
deterministic plain-text presentation to the provider. Existing persisted
answers work with both changes; they do not need a database migration.

### Browser requests fail CORS

Add the exact client origin to `WEB_ORIGINS` and restart Nest. Avoid `*` when the
API leaves localhost.

## 15. What Milestone 5 deliberately excludes

Milestone 5 is English P0 only. It does not claim Yoruba or Hausa ASR/TTS,
streaming partial transcription, streaming audio generation, audio storage,
speaker identification, authentication, student profiles, distributed rate
limits, long-term adaptive tutoring, cross-session progress tracking, teacher
dashboards, deployment, screenshots, a real-device compatibility matrix, or
final seminar evaluation fixtures. Those remain Milestone 6 or later work.

## Milestone 5 refinement: bounded reinforcement learning

The voice tutor now reinforces a completed explanation with a short learning
check. This is deliberately a bounded extension of one grounded run, not an
open-ended chatbot or a student profile.

### Ground questions in the verified explanation

`POST /api/tutor/runs/:runId/reinforcement` works only for a completed,
non-refused run with `grounding.grounded=true`. It is idempotent: requesting the
same run again returns its persisted question set rather than paying for another
generation.

The application first extracts readable answer units from the canonical
`finalAnswer` and assigns opaque IDs. The question provider receives those
units, the original question, canonical citations, and cited retrieved chunks.
Strict structured output selects an answer-unit ID rather than asking the model
to copy or paraphrase an expected answer. It also contains a question, hint, and
evidence IDs. Application validation then requires:

- The configured question count, three by default.
- Distinct questions and expected answers.
- Every selected answer unit to be an exact readable excerpt from the already
  verified answer.
- Every evidence ID to belong to the run's canonical citation set.
- A hint that neither contains the answer nor overlaps substantially with its
  important words. A leaking hint is replaced by a safe application-owned
  prompt to revisit the relevant explanation rather than failing the whole set.

Expected answers stay server-side and are never returned by POST or GET. This
lets the tutor ask about what it actually explained without creating a second,
unverified body of science content. Malformed generation receives at most one
bounded retry; no partial set is persisted.

### Evaluate understanding without generating the answer

`POST /api/tutor/runs/:runId/reinforcement/answers` accepts:

```json
{
  "questionId": "uuid",
  "answer": "The student's own words",
  "voiceSessionId": "optional ASR voice-session UUID"
}
```

The evaluator compares the student's answer with the internal expected answer.
It accepts semantically equivalent wording rather than demanding memorisation.
Its strict output is only `correct`, `confidence`, and an internal concise
classification summary. It is explicitly forbidden to write student feedback,
provide a hint, or reveal the expected answer.

Application code owns the response:

- A first-attempt correct response receives warm encouragement.
- A correct retry acknowledges that the student worked through the hint.
- An incorrect response receives supportive wording plus the pre-validated hint.
- A low-confidence positive classification is treated as incorrect.
- Each question permits at most three evaluations. After exhaustion, the learner
  moves on without being shown the answer.

This separation matters: the model understands equivalent student wording, but
cannot improvise an answer inside its feedback.

### Support typed and recorded answers

The browser adds a **Quick learning check** after the grounded answer and speech
are ready. It shows one question at a time, progress, remaining attempts, the
latest praise or hint, and a final completion state.

Students may type an answer or use **Record my answer**. Recorded responses reuse
the existing bounded transcription endpoint and require transcript review before
submission. The returned voice session is linked to the persisted reinforcement
attempt, so it cannot be reused for another response. Audio bytes remain
transient; the transcript and attempt are persisted.

### Persist the learning loop

Migration `2026072412000-AddReinforcementLearning.ts` adds:

```text
reinforcement_question_sets
├── one unique row per tutor run
├── internal question/rubric/hint JSONB
└── model and token/cost usage

reinforcement_attempts
├── question and attempt number
├── submitted answer
├── correct, application feedback, and optional hint
├── evaluator summary, latency, and usage
└── optional unique voice-session link
```

Both tables cascade when their tutor run is removed. Existing Milestone 1–5
runs are preserved and simply have no reinforcement set.

### Configuration

Question generation and answer evaluation have separate replaceable models and
token/cost settings:

```dotenv
REINFORCEMENT_MODEL=gpt-5.6-terra
REINFORCEMENT_MAX_OUTPUT_TOKENS=1600
REINFORCEMENT_INPUT_COST_PER_MILLION_TOKENS_USD=2.50
REINFORCEMENT_OUTPUT_COST_PER_MILLION_TOKENS_USD=15.00
REINFORCEMENT_EVALUATOR_MODEL=gpt-5.6-terra
REINFORCEMENT_EVALUATOR_MAX_OUTPUT_TOKENS=300
REINFORCEMENT_EVALUATOR_INPUT_COST_PER_MILLION_TOKENS_USD=2.50
REINFORCEMENT_EVALUATOR_OUTPUT_COST_PER_MILLION_TOKENS_USD=15.00
REINFORCEMENT_QUESTION_COUNT=3
REINFORCEMENT_GENERATION_ATTEMPTS=2
REINFORCEMENT_MAX_ATTEMPTS_PER_QUESTION=3
REINFORCEMENT_TIMEOUT_MS=30000
```

Automated tests use deterministic provider fakes. They cover strict generation
and evaluation, canonical answer-unit and evidence selection, hidden rubrics,
hint-leak replacement, bounded generation retry, idempotency, correct praise,
incorrect hints, successful answer retries, maximum attempts, browser
submission, and PostgreSQL persistence. They make no paid reinforcement calls.

---

# Milestone 6: Evaluation and Seminar Evidence

> Historical note: this milestone records the original YarnGPT configuration
> and its evidence. The later ElevenLabs provider revision is documented in
> Milestone 7 below. Existing results and artifacts are intentionally not
> rewritten.

## Milestone status

The provider adapter, evaluation harness, live system-level evaluation, exports,
CI workflow, architecture/privacy documentation, and deterministic seminar
evidence are implemented. No deployment was attempted.

Some publication checks necessarily remain with the repository owner: human
listening and manual evidence review, a real-microphone and second-device
rehearsal, a narrated live recording with audible YarnGPT output, resolution of
the corpus attribution gap, and manual deployment. This distinction lets us
mark the software/evaluation implementation complete without pretending the
seminar has already been published.

## 1. Why YarnGPT, and why only tutor TTS

Milestone 6 selects YarnGPT because its catalogue includes Nigerian voices and
describes Chinenye as engaging and warm—appropriate qualities for a patient
secondary-school tutor. The integration is intentionally narrow:

```text
completed grounded tutor run
        │ run ID
        ▼
POST /api/tutor/runs/:runId/speech
        │ load persisted canonical finalAnswer
        ▼
deterministic Markdown-to-speech cleanup
        │ canonical answer text only
        ▼
YarnGPT POST /api/v1/tts
        │ transient audio
        ▼
browser controls
```

YarnGPT performs no transcription, microphone processing, query
transformation, embedding, retrieval, tutor generation, grounding verification,
translation, or reinforcement work. OpenAI remains the ASR provider. Existing
tutor, verifier, retrieval, and reinforcement adapters are unchanged.
Reinforcement prompts, praise, hints, student answers, and student-answer audio
are never sent to or spoken by YarnGPT.

This separation prevents a voice provider from changing the verified content.
It also means a YarnGPT outage cannot turn into an answer-generation failure:
the written answer, citations, evidence, trace, and learning check remain
visible.

## 2. Implement the provider behind the existing contract

`YarnGptSpeechProvider` implements the same `SpeechProvider` interface as
`OpenAiSpeechProvider`. `VoiceModule` selects exactly one implementation from
`TTS_PROVIDER`. The default is `yarngpt`; `openai` is a manual fallback.
Failures never trigger automatic fallback because silently replacing the
selected Nigerian voice would conceal provider reliability.

The server configuration is:

```dotenv
TTS_PROVIDER=yarngpt
YARN_GPT_API_KEY=
YARN_GPT_API_URL=https://yarngpt.ai/api/v1/tts
YARN_GPT_VOICE=Chinenye
YARN_GPT_RESPONSE_FORMAT=mp3
YARN_GPT_MAX_INPUT_CHARACTERS=2000
YARN_GPT_TIMEOUT_MS=30000
YARN_GPT_MAX_AUDIO_RESPONSE_BYTES=10485760
YARN_GPT_PRICING_VERSION=unconfigured-2026-07-24
YARN_GPT_PRICING_CURRENCY=NGN
YARN_GPT_PRICING_EFFECTIVE_DATE=
YARN_GPT_COST_PER_1000_CHARACTERS=
```

The actual credential belongs only in local/server environment configuration.
It is absent from the template value, source, Vite variables, browser,
tests, logs, trace events, evaluation exports, screenshots, and this article.
The browser never receives the YarnGPT URL or authorization header.

## 3. Preserve the grounded-run-only security boundary

The browser posts only a UUID. Before invoking the selected speech adapter,
`SpeechService`:

1. loads the persisted `TutorRun`;
2. requires `status=completed`;
3. rejects `refused=true`;
4. requires a non-null `finalAnswer`;
5. requires `grounding.grounded=true`;
6. converts that answer with the existing deterministic Markdown cleanup;
7. enforces the selected provider input ceiling.

Unknown, running, failed, refused, ungrounded, empty, and overlong runs never
call YarnGPT. There is no arbitrary text-to-speech route, and browser edits
cannot change the text passed to the provider. Unit and integration tests
exercise each forbidden state.

YarnGPT documents a 2,000-character limit. The application takes the lower of
that ceiling and `YARN_GPT_MAX_INPUT_CHARACTERS`. It never truncates a verified
answer, splits it into unverified calls, or concatenates MP3 bytes. An overlong
answer remains fully readable and records a safe `SPEECH_INPUT_TOO_LONG`
metric. Newly generated canonical tutor answers are independently constrained
to 2,000 characters in both the model's structured-output schema and the
server's output validator. The speech guard remains necessary for older
persisted runs, locally lowered provider limits, and anomalous data.

## 4. Treat audio responses as untrusted

The adapter uses both the service abort signal and its own timeout signal,
disables hidden retries, and requires:

- a successful HTTP status;
- a content type matching the requested MP3, WAV, Opus, or FLAC format;
- a non-empty body;
- a response below the configured 10 MiB ceiling;
- a format-specific signature (`ID3`/MP3 sync, RIFF/WAVE, OggS, or fLaC).

JSON/HTML disguised as audio, declared or actual oversized bodies, empty
responses, malformed bytes, network errors, authentication failures, rate
limits, HTTP errors, and timeouts map to safe codes. The server never logs the
authorization header, answer text, raw response, or raw error body. The browser
receives a safe message and retains the written result.

The response sets the correct browser content type, `no-store`, `private`, and
`nosniff`, plus safe metadata headers for provider, API version, voice, format,
latency, bytes, and pricing state. The UI displays “AI-generated tutor voice,”
YarnGPT, Chinenye, MP3, latency, and native playback controls. Retry is an
explicit button and remains under the existing per-IP rate limit.

## 5. Record honest voice metrics and cost

The existing `voice_sessions.tts_metrics` JSONB column can represent the new
fields without a schema change, so a seventh migration would add ceremony
without improving honesty. `synchronize` remains false and all six explicit
migrations remain authoritative.

Success and preflight/provider failure metrics contain:

```text
provider, apiVersion, model, voice, format
characterCount, outputByteCount, latencyMs
success, failureCode
pricingVersion, pricingCurrency, pricingEffectiveDate
costStatus, estimatedCost, estimatedCostUsd
```

YarnGPT's public pricing page rendered zero-value placeholders while its terms
state that credits are deducted on use. We therefore do not infer that TTS is
free. The explicit rate remains blank, currency is NGN, and cost is marked
unavailable. Known OpenAI USD estimates remain a subtotal; unavailable YarnGPT
cost is never added as zero and no naira/dollar exchange rate is invented.

## 6. Minimise provider data exposure

Only the cleaned canonical grounded answer is sent to YarnGPT. Microphone audio,
student question, transcript, retrieved chunks, citation metadata, prompts,
reasoning, provider responses, reinforcement data, accounts, and identifiers
are excluded.

The application stores no generated audio in PostgreSQL, Redis, BullMQ, upload
storage, logs, the repository, or evaluation output. The live harness reads the
response only to count bytes, then releases it.

YarnGPT's terms grant it a limited licence to process user content to provide
and improve the service. Its privacy policy says content is retained only as
long as needed and deleted shortly afterward, and may be shared with underlying
technology partners. We do not turn that language into a zero-retention claim.
Operators must review the current terms and privacy policy before deployment.

## 7. Select the tutor voice

The five candidate voices were tested through the existing grounded-run speech
route using one canonical completed answer. Audio was streamed to `/dev/null`;
only safe latency/reliability headers were recorded:

| Voice | Calls | Reliability | Latency |
|---|---:|---|---:|
| Chinenye | 6 | 6 successful | 23,220 ms median |
| Idera | 1 | safe timeout | 30,000 ms ceiling |
| Jude | 1 | safe timeout | 30,000 ms ceiling |
| Regina | 1 | successful | 25,703 ms |
| Femi | 1 | successful | 27,537 ms |

Chinenye remains the selected voice because its documented engaging/warm
character fits the role and it had the strongest observed reliability. The
sample is small and unequal. A terminal cannot judge accent authenticity,
naturalness, clarity, pace, STEM vocabulary, units, or equation pronunciation;
those cells remain “not assessed” in `demo/voice-selection.md` for the human
author. This is not a student study or evidence of student preference.

## 8. Lock the evaluation fixtures

`demo/fixtures/stem-evaluation-v1.json` contains ten stable English fixtures:
six supported questions, two clearly out-of-syllabus prompts, a misspelled
kinetic-energy query, and one related insufficient-evidence boundary.

The fixtures were written from local corpus records before the run. Each
contains its stable ID, question, language, expected completion/refusal, topic,
document ID/title, pages, chunk IDs, required concepts, forbidden claims, ASR
flag, and justification. The set also records document and ingestion IDs. We do
not change an expectation after seeing generated output.

The local corpus metadata identifies two `Basic Science Text` documents with
`CC BY-ND` but omits source URL, named author, and publisher. The fixture
manifest preserves that gap; the owner must resolve attribution before public
publication.

## 9. Build mock and live harness modes

The root command defaults to mock:

```bash
npm run demo
npm run demo -- --mode mock
```

Mock mode makes no external request and spends no credit. It validates fixture
shape/category minimums, scoring, denominators, serialization, CSV escaping,
article output, and unique historical directories. CI uses it.

Live mode requires explicit confirmation:

```bash
DEMO_LIVE_CONFIRM=YES \
DEMO_API_ORIGIN=http://localhost:3000 \
TTS_PROVIDER=yarngpt \
npm run demo -- --mode live
```

It uses bounded retries, continues after individual failures, records exact
models/configuration, and never prints a provider body. Speech is requested only
for canonical completed grounded runs. Refused and failed runs never invoke
YarnGPT.

Every unique results directory contains JSON, CSV, Chapter 4 Markdown, a
manifest, and a separate manual-review template. The manifest records run/time,
commit and dirty state, corpus/ingestion IDs, fixture/application versions,
retrieval threshold/top-k, tutor/verifier/embedding/ASR identifiers, YarnGPT API
version/voice/format, pricing metadata, and non-secret limits.

## 10. Define metrics and denominators

Per-fixture exports include expected/actual disposition, run ID, retrieved
chunks/topics/scores, source hit, refusal correctness, structural citations,
verifier judgement, revision count, stage/total/ASR/TTS latency, YarnGPT result,
tokens, cost state, safe error, and reinforcement status.

Aggregate calculations keep failures in the relevant denominators:

- retrieval hit over fixtures that expect evidence, including the boundary;
- correct refusal over expected refusals;
- incorrect refusal, structural citations, grounded completion, and end-to-end
  voice success over expected completions;
- revision rate over all fixtures;
- median/p95 latency over all fixtures;
- YarnGPT provider reliability separately over calls actually made.

Structural citation validity, model-verifier judgement, and manual author review
are distinct fields. The verifier is never labelled human validation.

## 11. Live results

The locked live run
`live-2026-07-24T14-31-33-561Z-98783bf4` produced:

| Metric | Result |
|---|---:|
| Fixtures | 10 |
| Disposition accuracy | 70.0% |
| Expected-source retrieval hit rate | 100.0% |
| Correct / incorrect refusal | 66.7% / 28.6% |
| Structural citation / grounded expected completion | 71.4% / 71.4% |
| Revision rate | 20.0% |
| Median / p95 latency | 28,732 / 42,076 ms |
| YarnGPT calls | 6 |
| YarnGPT call reliability | 6/6 |
| End-to-end expected voice success | 5/7 |
| Median YarnGPT latency | 23,220 ms |
| Known USD subtotal | $0.23064668 |
| Complete median and total cost | unavailable |

The SI-units and misspelled kinetic-formula fixtures were incorrectly refused.
The locked kinetic-definition boundary completed when it was expected to
refuse. Those findings stay visible and are useful: retrieval found the source
for every fixture, but downstream evidence sufficiency/disposition still needs
tuning. We did not rewrite the fixture.

The deterministic mock result reports 100% because it validates expected
scoring/export behavior, not model quality. Its summary is prominently marked
mock.

## 12. Manual review rubric

`manual-grounding-review.json` contains one record per completed answer asking
whether material claims have evidence, the question is answered, citations
identify relevant passages, external facts are absent, language suits secondary
school, and analogies are identified. It is intentionally unfilled because the
author has not reviewed it. A null is not a pass.

This remains system evaluation. No student participated, and no learning
effectiveness claim follows from it.

## 13. Local validation and evidence capture

Local checks confirmed PostgreSQL 16.10, pgvector 0.8.0, `pg_trgm` 1.6,
Redis/BullMQ readiness, all six migrations, live supported and refusal paths,
grounded citations, YarnGPT metadata/audio, and no YarnGPT call for refused
fixtures. The evaluation exercised typed questions. Automated browser tests
cover editable transcription, SSE, evidence, answer, speech degradation,
reinforcement, refusals, and duplicate prevention.

Five screenshots were captured from the local React application with
deterministic API routes. The evaluation screenshot renders the live JSON. A
WebM fallback recording shows virtual microphone activation, editable
transcript, trace, evidence, answer, YarnGPT-labelled controls, reinforcement,
and refusal. Artifact metadata records captions, date, git state, environment,
run IDs, voice, and source mode.

This environment did not provide a real human microphone, speaker listening, or
second physical device. The fallback video has no human spoken question or
audible live YarnGPT track. We do not claim otherwise. A real-device narrated
recording remains a publication check.

## 14. CI and reproduction

CI has no provider credentials and makes no paid calls. It runs:

```text
API + web lint
API unit tests, including deterministic YarnGPT response validation
web tests
all six explicit migrations
PostgreSQL/Redis integration tests
Nest/Vite production builds
mock demo harness
```

Reproduce the full local verification:

```bash
npm ci
npm run db:up
npm run migration:run
npm run lint
npm test
npm run test:integration
npm run build
npm run demo -- --mode mock
```

Run live evaluation only with explicit local credentials and confirmation. Run
the deterministic evidence script after installing Playwright Chromium:

```bash
npx playwright install --with-deps chromium
npm run start:dev --workspace web -- --host 127.0.0.1 --port 5174
npm run evidence:capture
```

## 15. Troubleshooting

### Speech returns 409 for a completed-looking run

Inspect persisted status, refusal, grounding, canonical answer, and cleaned
character count. YarnGPT's effective ceiling can never exceed 2,000. The
written answer remains canonical and untruncated. New tutor runs use a
2,000-character canonical-answer contract, so this error normally indicates a
run created before that constraint or a locally configured
`YARN_GPT_MAX_INPUT_CHARACTERS` below 2,000. Ask the question again after
restarting the API with the updated code; an existing verified answer is never
silently rewritten merely to make it speakable.

### Speech returns a safe 502 or 504

Check provider configuration, account state, timeout, response content type,
and configured response-size limit. Inspect persisted safe `failureCode` and
latency, not raw upstream bodies. Retry explicitly. Switch to
`TTS_PROVIDER=openai` only as an operator decision; there is no automatic
fallback.

### Audio content type is rejected

The provider must return a supported audio MIME type that matches MP3, WAV,
Opus, or FLAC and valid format bytes. JSON, HTML, empty, oversized, and malformed
bodies are rejected even after HTTP 200.

### Complete cost is unavailable

That is intentional until a defensible YarnGPT rate is configured. Set rate,
currency, version, and effective date together. Do not enter zero from the
dynamic placeholder page or invent an exchange rate.

### Live evaluation will not start

Start the local API, ensure the corpus exists, keep the documented threshold,
set both server credentials, select YarnGPT, and pass
`DEMO_LIVE_CONFIRM=YES`. The command refuses ambiguous paid execution.

### Playwright cannot launch Chromium

Run `npx playwright install --with-deps chromium`. On a locked-down machine,
capture on the owner's normal presentation device rather than committing host
libraries to the repository.

## 16. Roadmap and handoff

Milestone 6 software implementation and system-level evaluation are complete.
The repository-owner follow-up is:

1. resolve corpus author/publisher/source URL and confirm redistribution;
2. complete the human voice-listening and manual evidence rubrics;
3. run a real microphone/speaker flow and second-device check;
4. capture the final narrated local demonstration;
5. choose hosting and provision production PostgreSQL/pgvector plus Redis;
6. apply migrations, configure server-only secrets/origins/limits, ingest the
   verified corpus, run readiness/live fixtures, and deploy manually.

Automated deployment, hosting configuration, cloud resources, domain/DNS, and
production secret setup remain explicitly excluded. Deployment has not been
completed or claimed.

---

# Milestone 7: Revise Tutor-Output Voice to ElevenLabs

## Status and historical boundary

This revision makes ElevenLabs the selected tutor-output speech provider without
changing the grounded-run security boundary. It does not rewrite Milestone 6:
the existing YarnGPT evaluation directories, screenshots, recording, voice
comparison, and latency/cost observations remain historical evidence.

No deployment was attempted. The current local ElevenLabs credential returned a
safe HTTP 401 during the required authenticated voice-list check, so this
revision does not claim a selected voice, human listening, or live synthesis.

## 1. Keep the provider surface narrow

The browser still submits only a run ID:

```text
completed grounded non-refused tutor run
        │ runId only
        ▼
POST /api/tutor/runs/:runId/speech
        │ load persisted canonical finalAnswer
        ▼
deterministic Markdown cleanup
        │ cleaned canonical answer only
        ▼
ElevenLabs non-streaming TTS
        │ transient MP3
        ▼
browser playback
```

Before TTS, `SpeechService` requires the persisted run, `status=completed`,
`refused=false`, `grounding.grounded=true`, a non-null canonical answer, a
non-empty cleaned answer, and compliance with the effective character limit.
Unknown, running, failed, refused, ungrounded, empty, and overlong runs never
call ElevenLabs.

ElevenLabs receives no student question, microphone audio, ASR transcript,
retrieved evidence, prompts, hidden reasoning, citations as metadata,
reinforcement content, account data, identifiers, or browser-supplied text.
OpenAI remains ASR. ElevenLabs STT, agents, cloning, speech-to-speech, and
reinforcement features are not used.

## 2. Select one provider without fallback

`ElevenLabsSpeechProvider` implements the existing `SpeechProvider` interface.
`VoiceModule` selects exactly one of `elevenlabs`, `yarngpt`, or `openai`.
ElevenLabs is the default; a failure is returned safely and never triggers
another provider.

```dotenv
TTS_PROVIDER=elevenlabs
ELEVEN_LABS_API_KEY=
ELEVEN_LABS_API_URL=https://api.elevenlabs.io/v1
ELEVEN_LABS_VOICE_ID=
ELEVEN_LABS_VOICE_NAME=
ELEVEN_LABS_MODEL_ID=eleven_flash_v2_5
ELEVEN_LABS_OUTPUT_FORMAT=mp3_44100_128
ELEVEN_LABS_LANGUAGE_CODE=en
ELEVEN_LABS_MAX_INPUT_CHARACTERS=40000
ELEVEN_LABS_TIMEOUT_MS=120000
ELEVEN_LABS_MAX_AUDIO_RESPONSE_BYTES=20971520
ELEVEN_LABS_ENABLE_LOGGING=true
ELEVEN_LABS_PRICING_VERSION=api-pricing-2026-07-24
ELEVEN_LABS_PRICING_CURRENCY=USD
ELEVEN_LABS_PRICING_EFFECTIVE_DATE=2026-07-24
ELEVEN_LABS_COST_PER_1000_CHARACTERS=0.05
```

Only the secret has an empty template value; the voice ID and display name are
also empty because voice selection is account-specific and must not use a
documentation example. Real values belong only in local or deployment
configuration, never browser variables, source, logs, traces, screenshots, or
evaluation exports.

## 3. Use the non-streaming HTTP endpoint

The canonical answer is complete before speech starts and the provider contract
returns a completed audio buffer, so the initial implementation uses:

```text
POST /v1/text-to-speech/{URL-encoded voice_id}
  ?output_format=mp3_44100_128
xi-api-key: server-side secret
content-type: application/json

{
  "text": "cleaned canonical grounded answer",
  "model_id": "eleven_flash_v2_5",
  "language_code": "en"
}
```

The adapter sends no other application data. `enable_logging=false` is added
only when an operator explicitly disables logging after confirming account
eligibility for Enterprise Zero Retention Mode.

## 4. Restore provider-independent answer length

The YarnGPT-era 2,000-character canonical-answer coupling was removed.
`TUTOR_ANSWER_MAX_CHARACTERS` is now 8,000 and controls the tutor's strict JSON
schema, provider-output validation, and agent-output validation.

Speech remains independently guarded. For ElevenLabs, the effective limit is
the lower of:

1. `ELEVEN_LABS_MAX_INPUT_CHARACTERS`;
2. the documented ceiling for a known configured model;
3. the application's 8,000-character canonical answer ceiling.

Flash v2.5 documents a 40,000-character request limit, so one normal answer fits
one request. Existing or anomalous overlong answers remain fully readable and
fail speech with `SPEECH_INPUT_TOO_LONG`; they are never truncated, split, or
joined as raw MP3.

## 5. Treat every response as untrusted

The adapter combines the service abort signal with a configurable provider
timeout, disables implicit fallback, and requires:

- a successful HTTP status;
- `audio/mpeg` or `audio/mp3` for `mp3_44100_128`;
- a valid non-negative declared content length when present;
- a non-empty body within the streamed 20 MiB default limit;
- an `ID3` or MPEG frame-sync signature.

Authentication, validation (422), rate-limit, timeout/network, and upstream
HTTP failures map to safe codes. JSON, HTML, empty, malformed, wrong-content
type, and oversized bodies are rejected. Raw error bodies are never read or
logged, and request text plus `xi-api-key` never enters logging.

## 6. Persist honest metrics and list-price estimates

The existing `voice_sessions.tts_metrics` JSONB is sufficient, so no migration
was added and `synchronize: false` remains unchanged. Each eligible attempt
records provider, API version, model, voice ID/display name, output format,
input characters, output bytes, latency, success or safe failure, and pricing
metadata.

The valid ElevenLabs `character-cost` header is stored separately as provider
usage credits. It is not currency. The configured USD $0.05 per 1,000
characters is a dated public Flash/Turbo API list-rate estimate, not an account
invoice or necessarily the marginal charge.

## 7. Privacy and retention

ElevenLabs documents provider-side retention by default and makes Zero Retention
Mode available only to eligible Enterprise customers. The default therefore
keeps `ELEVEN_LABS_ENABLE_LOGGING=true` and makes no zero-retention claim.
Repository owners must review the current terms, privacy policy, content rights,
and organizational requirements before manual deployment.

## 8. Voice selection is still manual

When no voice ID is configured, an authenticated read-only `GET /v2/voices`
check must inspect existing voice names, IDs, descriptions, accent labels, and
model compatibility. Prefer an actually labelled Nigerian or suitable African
English voice if available, but never infer an accent from a name and never
clone or create a voice.

The author must listen for warmth, clarity, pace, STEM vocabulary, units, and
equations. This is an author assessment, not evidence of student preference.
The check in this development environment returned HTTP 401, so the ID and name
remain unset pending corrected local credentials.

## 9. Browser and evaluation changes

Successful playback displays “AI-generated tutor voice,” ElevenLabs, the safe
voice display name, exact model and format, latency, and native controls.
Speech failure preserves the written answer, citations, evidence, trace, and
learning check; retry remains explicit and rate-limited.

The evaluation harness is provider-generic. Mock mode makes no external calls
and creates a unique ElevenLabs-labelled result directory. Live mode requires
explicit confirmation plus a valid key, voice ID, and display name; it calls
speech only for completed grounded non-refused runs, records exact
model/voice/format/usage/latency/cost, and continues after fixture or TTS
failures. Historical YarnGPT directories are untouched.

## 10. Verification and troubleshooting

```bash
npm run lint
npm test
npm run test:integration
npm run build
npm run migration:show
TTS_PROVIDER=elevenlabs npm run demo -- --mode mock
```

Run live only after correcting local configuration:

```bash
DEMO_LIVE_CONFIRM=YES \
DEMO_API_ORIGIN=http://localhost:3000 \
TTS_PROVIDER=elevenlabs \
npm run demo -- --mode live
```

- A 409 means the persisted run/grounding/refusal/answer or effective length
  precondition failed. The written answer is preserved.
- A safe 502/504 means configuration, authentication, quota, provider
  validation, content type/signature, response size, network, or timeout should
  be checked through safe metrics rather than raw bodies.
- An absent voice ID is intentionally `SPEECH_NOT_CONFIGURED`; perform the
  authenticated account lookup and author listening assessment.
- Provider failure never triggers YarnGPT or OpenAI automatically.

Hosting, production secrets, corpus preparation, live listening/device review,
and manual deployment remain the repository owner's responsibility.

---

# Milestone 8: Translate Grounded Answers and Speak with 9jaLingo

## Status

The current post-grounding flow now supports Nigerian Pidgin, Igbo, Yoruba, and
Hausa. Retrieval, tutor generation, citation enforcement, and independent
grounding verification remain English because the approved curriculum corpus is
English. Only the completed grounded answer is translated.

```text
English curriculum evidence
  → verified canonical English answer
  → Gemini translation (pcm, ig, yo, or ha)
  → persisted translated answer
  → 9jaLingo language-specific speaker
  → transient WAV playback
```

`POST /api/tutor/runs` and the streaming route accept
`preferredLanguage: "pcm" | "ig" | "yo" | "ha"`. Nigerian Pidgin is the
default. The browser exposes the same four choices.

Gemini uses `gemini-2.5-flash` by default and a strict JSON response containing
only `translatedText`. The prompt preserves scientific meaning, established
English scientific terms where useful, Markdown, equations, units, numbers, and
citations. It forbids adding or inferring lesson content. The English
`finalAnswer` remains canonical; `translatedAnswer` and safe translation
metadata are stored in separate columns added by
`AddTranslatedTutorOutput2026072610000`.

9jaLingo is the default `TTS_PROVIDER`. The adapter calls
`POST https://api.9jalingo.org/v1/audio/speech` with only the cleaned persisted
translation, model, selected speaker, target language code, and WAV format. The
default documented speaker IDs are `ada_pcm`, `adaeze_ig`, `adeola_yo`, and
`aisha_ha`; each is configurable. API keys remain server-side.

Speech still accepts only a run ID and rechecks completion, refusal, grounding,
canonical answer, translation, and length. It validates the provider status,
WAV content type, declared and streamed size, and RIFF/WAVE signature. Audio
remains transient, provider failure does not trigger automatic fallback, and
the written translated answer plus verified English source remain available.

## Chunk long 9jaLingo lessons without changing the playback contract

The provider adapter already had a 120-second `AbortSignal.timeout` controlled
by `NAIJALINGO_TIMEOUT_MS`. An abort at that boundary becomes
`SPEECH_PROVIDER_TIMEOUT`. This is distinct from the former service
`Promise.race`, which emitted `VOICE_PROVIDER_TIMEOUT`. The service boundary is
now restored as a configurable per-attempt deadline,
`TTS_APPLICATION_TIMEOUT_MS` (65 seconds by default), and reports
`SPEECH_APPLICATION_TIMEOUT`. Keeping separate codes identifies which deadline
actually stopped a request.

For 9jaLingo, cleaned speech is normalized to NFC so Igbo and Yoruba diacritics
are retained. Arrows become “to”, em dashes become spoken pauses, smart quotes
become ASCII quotes, and Unicode ellipses are normalized. Lessons are split at
roughly 400–700 characters, preferring paragraphs, then sentences, then
clauses. The scanner ignores boundaries inside parentheses and avoids common
abbreviations, decimals, initials, and numbered-list prefixes. Whitespace is
used as the hard fallback so ordinary words are not split.

Chunks are synthesized sequentially. HTTP 429, 502, 503, 504, network errors,
provider timeouts, application timeouts, and empty responses are retried with
bounded exponential backoff. Authentication, validation, explicit inference or
unsupported-input rejection, unsupported content, invalid audio, and other 4xx
responses are not retried.

The HTTP endpoint still returns one `audio/wav` body. Whole WAV files are never
appended. Instead, the service parses each RIFF container, verifies that every
chunk has the same PCM/IEEE-float `fmt ` payload, concatenates only the ordered
audio data, and writes a new RIFF/WAVE header. The other selectable providers
continue to receive one request because their encoded MP3/Ogg/FLAC outputs
would require a different format-aware muxer or a breaking playlist contract.

The existing `voice_sessions.tts_metrics` JSONB column now records total input
characters, chunk count, each chunk's characters/latency/retries/output bytes
and outcome, failed chunk index, total synthesis latency, total returned bytes,
and provider failure code. Metrics are updated after every chunk, so partial
failure remains visible without a schema migration.

Successful chunk audio remains subject to the application's no-audio-
persistence rule. A bounded TTL/byte-limited in-memory cache, keyed by voice
session plus a text/provider/voice fingerprint, allows a retry handled by the
same API process to resume at the failed chunk. A restart or request routed to
another replica loses that transient audio and must regenerate it. Durable
cross-replica resumption would require an explicitly approved encrypted object
store and retention policy.
