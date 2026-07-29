# Chapter 3 Source Dossier — Investigative Approach (Methodology)

## Scope and evidential rule

This dossier describes the repository state inspected for Chapter 3. It treats executable code, lockfiles, migrations, example configuration, tests, and checked-in fixtures as evidence; it does not treat a developer's uncommitted `.env`, provider dashboards, or an assumed live database as evidence. Where the repository does not determine a value, the value is **UNKNOWN**. [package.json] [api/src/app.module.ts] [api/src/database/data-source.ts]

No credential value is reproduced here. Credential names are reported only where they are part of the documented configuration or a server-side guard/provider boundary. [.env.example] [api/src/corpus/guards/admin-ingestion-key.guard.ts]

## 1. Technology stack inventory

### 1.1 Application, infrastructure, and test stack

“Exact version” below means the installed version resolved in `package-lock.json`, except for container images and the Node major pin. The root manifest declares a Node compatibility range but no `packageManager` field, so the npm version is not determined by the repository. [package-lock.json] [package.json] [.nvmrc]

| Component | Exact version or pin | Role | Source file |
|---|---:|---|---|
| Node.js | `22` major pin; supported range `>=20 <23`; exact minor/patch **UNKNOWN** | JavaScript runtime for both workspaces and scripts | [.nvmrc] [package.json, `engines`] |
| npm | **UNKNOWN** | Workspace/package manager; no npm version or `packageManager` pin is declared | [package.json] |
| npm workspaces | `api`, `web` | Monorepo boundary | [package.json, `workspaces`] |
| NestJS common/core | `11.1.28` | API framework and dependency-injection runtime | [package-lock.json, `node_modules/@nestjs/common` and `node_modules/@nestjs/core`] |
| NestJS Config | `4.0.4` | Environment-backed application configuration | [package-lock.json, `node_modules/@nestjs/config`] |
| NestJS platform-express | `11.1.28` | Express HTTP adapter and multipart interceptor integration | [package-lock.json, `node_modules/@nestjs/platform-express`] [api/src/main.ts] |
| NestJS TypeORM adapter | `11.0.3` | Nest-to-TypeORM integration | [package-lock.json, `node_modules/@nestjs/typeorm`] |
| TypeORM | `0.3.31` | Entities, repositories, transactions, and explicit migrations | [package-lock.json, `node_modules/typeorm`] |
| `pg` | `8.22.0` | PostgreSQL driver | [package-lock.json, `node_modules/pg`] |
| PostgreSQL container | PostgreSQL `16` image family, image pin `pgvector/pgvector:0.8.0-pg16` | Primary relational store and vector-query engine | [compose.yaml, `database.image`] |
| pgvector | `0.8.0` image pin | `vector(1536)`, cosine distance, and HNSW indexing | [compose.yaml] [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] |
| `pg_trgm` | `1.6` in the latest checked-in local-validation record; current runtime version **UNKNOWN** until queried | Trigram lexical matching and GIN index support; the migration enables it but does not pin its version | [docs/building-the-stem-ai-tutor.md, “Local validation and evidence capture”] [api/src/database/migrations/2026072223000-AddHybridCorpusSearch.ts] |
| Redis container | `7.4.2-alpine` locally; CI uses `7.4-alpine` | BullMQ backing store with local append-only persistence | [compose.yaml, `redis`] [.github/workflows/ci.yml, `services.redis`] |
| NestJS BullMQ adapter | `11.0.4` | Nest queue registration and worker integration | [package-lock.json, `node_modules/@nestjs/bullmq`] |
| BullMQ | `5.80.10` | Background corpus-ingestion jobs | [package-lock.json, `node_modules/bullmq`] |
| ioredis | `5.11.1` | Redis client used by the queue stack | [package-lock.json, `node_modules/ioredis`] |
| React / React DOM | `18.3.1` / `18.3.1` | Browser user interface | [package-lock.json, `node_modules/react` and `node_modules/react-dom`] |
| React Markdown | `10.1.0` | Structured lesson rendering | [package-lock.json, `node_modules/react-markdown`] [web/src/App.tsx] |
| Vite | `6.4.3` | Browser development server and production bundler | [package-lock.json, `node_modules/vite`] |
| TypeScript | `5.9.3` | API and browser implementation language/compiler | [package-lock.json, `node_modules/typescript`] |
| Jest | `29.7.0` | API unit and integration/e2e test runner | [package-lock.json, `node_modules/jest`] [api/package.json, `jest` and scripts] |
| Vitest | `4.1.10` | Browser-unit test runner | [package-lock.json, `node_modules/vitest`] [web/package.json, `scripts.test`] |
| Testing Library React / jest-dom / user-event | `16.3.2` / `6.9.1` / `14.6.1` | Browser component assertions and interactions | [package-lock.json, corresponding `node_modules/@testing-library/*` entries] |
| ESLint | `9.39.5` | API and browser static checks | [package-lock.json, `node_modules/eslint`] [package.json, `scripts.lint`] |
| multer | `2.2.0` | In-memory multipart PDF and audio receipt | [package-lock.json, `node_modules/multer`] [api/src/corpus/corpus.controller.ts] [api/src/voice/voice.controller.ts] |
| pdf-parse | `2.4.5` | Page-level text extraction from text-bearing PDFs | [package-lock.json, `node_modules/pdf-parse`] [api/src/corpus/services/pdf-extractor.service.ts] |
| class-validator / class-transformer | `0.15.1` / `0.5.1` | DTO validation, trimming, and numeric transformation | [package-lock.json, corresponding package entries] [api/src/main.ts] |
| reflect-metadata | `0.2.2` | Decorator metadata required by NestJS/TypeORM | [package-lock.json, `node_modules/reflect-metadata`] [api/package.json] |
| dotenv | API `17.4.2`; root script resolution `17.4.1` | Loads `.env` for the migration data source and evaluation script | [package-lock.json, `api/node_modules/dotenv` and `node_modules/dotenv`] [api/src/database/data-source.ts] [demo/scripts/run-demo.mjs] |
| OpenAI SDK | `6.48.0` | Responses API, embeddings, ASR, and optional OpenAI TTS adapters | [package-lock.json, `node_modules/openai`] [api/src/tutor/providers/openai-model-response.client.ts] |
| Google Gen AI SDK | `2.13.0` | Gemini translation adapter | [package-lock.json, `node_modules/@google/genai`] [api/src/tutor/translation/gemini-translation.provider.ts] |
| RxJS | `7.8.2` | Nest runtime dependency | [package-lock.json, `node_modules/rxjs`] [api/package.json] |
| Playwright | `1.55.0` | Scripted evidence capture, not the application request path | [package-lock.json, `node_modules/playwright`] [package.json, `scripts.evidence:capture`] |
| Supertest | `7.2.2` | HTTP assertions in API e2e/integration suites | [package-lock.json, `node_modules/supertest`] [api/test/health.e2e-spec.ts] |

### 1.2 External AI services and exact configured models

The table reports model identifiers from `.env.example` and configuration/provider code. It does not infer a newer model from provider documentation. [.env.example]

| Provider | Exact model identifier/pin | Pipeline role | Config variable | Source |
|---|---|---|---|---|
| OpenAI | `gpt-5.6-luna` | Query transformation before retrieval | `QUERY_TRANSFORMER_MODEL` | [.env.example] [api/src/tutor/query-transformer/openai-query-transformer.provider.ts] |
| OpenAI | `gpt-5.6-terra` | Evidence-bounded tutor drafting and the one possible revision | `TUTOR_MODEL` | [.env.example] [api/src/tutor/providers/openai-tutor.provider.ts] |
| OpenAI | `gpt-5.6-terra` | Independent grounding verification | `GROUNDING_VERIFIER_MODEL` | [.env.example] [api/src/tutor/providers/openai-grounding-verifier.provider.ts] |
| OpenAI | `text-embedding-3-small`, `1536` dimensions | Corpus and query embeddings | `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | [.env.example] [api/src/corpus/embeddings/openai-embedding.provider.ts] |
| OpenAI | `gpt-4o-mini-transcribe-2025-12-15` | English ASR | `ASR_MODEL` | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| 9jaLingo | `9jalingo-tts-1` | **Current default TTS** for `pcm`, `ig`, `yo`, and `ha`; returns WAV | `TTS_PROVIDER=naijalingo`, `NAIJALINGO_MODEL` | [.env.example] [api/src/voice/voice.module.ts] |
| ElevenLabs | `eleven_flash_v2_5` | Retained explicit TTS alternative | `TTS_PROVIDER=elevenlabs`, `ELEVEN_LABS_MODEL_ID` | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| YarnGPT | `yarngpt-tts-v1` | Retained explicit TTS alternative; model name is fixed in policy code | `TTS_PROVIDER=yarngpt` | [api/src/voice/policies/voice-policy.service.ts, `selectedTtsModel`] [.env.example] |
| OpenAI | `gpt-4o-mini-tts-2025-12-15` | Retained explicit TTS alternative | `TTS_PROVIDER=openai`, `TTS_MODEL` | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| Google Gemini | `gemini-3.5-flash-lite` | Translation of the grounded English answer into the selected Nigerian language | `GEMINI_TRANSLATION_MODEL` | [.env.example] [api/src/tutor/translation/gemini-translation.provider.ts] |
| OpenAI | `gpt-5.6-terra` | Generate evidence-linked reinforcement questions | `REINFORCEMENT_MODEL` | [.env.example] [api/src/tutor/reinforcement/openai-reinforcement-question.provider.ts] |
| OpenAI | `gpt-5.6-terra` | Evaluate reinforcement answers | `REINFORCEMENT_EVALUATOR_MODEL` | [.env.example] [api/src/tutor/reinforcement/openai-reinforcement-evaluation.provider.ts] |

## 2. System architecture

### 2.1 Shape and module map

The root is an npm workspace with `api` and `web`. The API is a Nest application; the browser is a Vite/React application. The global API prefix is `/api`, accepted browser origins are configurable, and global DTO validation transforms input, removes undeclared fields, and rejects non-whitelisted fields. [package.json] [api/src/main.ts]

| Nest module | Implemented responsibility | Source |
|---|---|---|
| `AppModule` | Global configuration, PostgreSQL/TypeORM connection, Redis/BullMQ connection and job defaults, and composition of the four feature modules | [api/src/app.module.ts] |
| `HealthModule` | Liveness plus readiness checks for PostgreSQL, vector/trigram support, and the corpus queue | [api/src/health/health.module.ts] [api/src/health/health.service.ts] |
| `CorpusModule` | Admin PDF intake, temporary storage, extraction, page-bounded chunking, embeddings, ingestion worker, metadata queries, and hybrid search | [api/src/corpus/corpus.module.ts] |
| `TutorModule` | Query transformer, deterministic retrieval agent/tool, tutor, verifier, orchestration, persistence/query services, translation, and reinforcement | [api/src/tutor/tutor.module.ts] |
| `VoiceModule` | OpenAI ASR, selectable TTS adapters, voice policy, in-memory rate limiting, voice-session metrics, sequential 9jaLingo chunk synthesis, and resumable in-process chunk cache | [api/src/voice/voice.module.ts] |

The browser records microphone audio where supported, allows typed input, requires review of editable ASR text, selects `pcm`/`ig`/`yo`/`ha`, consumes the tutor SSE trace, renders Markdown and canonical citations, requests speech by run ID, plays a transient object URL, and presents the optional learning check. [web/src/App.tsx] [web/src/api.ts] [web/src/recorder.ts]

PostgreSQL holds corpus metadata/chunks/vectors, tutor runs, trace/tool records, translation state, voice metrics, and reinforcement state. Redis holds BullMQ state for corpus ingestion. Temporary uploaded PDFs reside under the configured corpus-upload directory until successful or final-failure cleanup. Successful partial TTS audio resides only in a bounded process-memory cache, and final audio is returned in the HTTP response rather than persisted. [api/src/database/data-source.ts] [api/src/app.module.ts] [api/src/corpus/services/upload-storage.service.ts] [api/src/corpus/processors/corpus-ingestion.processor.ts] [api/src/voice/services/speech-chunk-cache.service.ts] [docs/privacy.md, “Application persistence”]

Only corpus ingestion runs on BullMQ, with worker concurrency one. Tutor orchestration, retrieval, model calls, translation, ASR, TTS, and reinforcement execute synchronously in the API request process; the repository documentation states that interactive work remains in-process while durable background processing is used for PDF ingestion. [api/src/corpus/processors/corpus-ingestion.processor.ts] [api/src/tutor/tutor.controller.ts] [api/src/voice/voice.controller.ts] [docs/building-the-stem-ai-tutor.md, Milestone 4 architecture]

### 2.2 Component diagram

```text
 Student browser (React/Vite)
   |  POST /api/voice/transcriptions -----------------------> OpenAI ASR
   |  POST /api/tutor/runs
   |  POST /api/tutor/runs/stream  (SSE trace)
   |  GET  /api/tutor/runs/:runId
   |  POST /api/tutor/runs/:runId/speech -------------------> selected TTS
   |  POST/GET /api/tutor/runs/:runId/reinforcement
   |  POST /api/tutor/runs/:runId/reinforcement/answers
   v
 NestJS API
   +-- Tutor orchestrator
   |    +-- query-transformer agent ------------------------> OpenAI Responses
   |    +-- deterministic retrieval agent
   |    |    +-- ToolRegistry -> curriculum.search
   |    |         +-- query embedding ----------------------> OpenAI Embeddings
   |    |         +-- hybrid SQL ----------------------------> PostgreSQL/pgvector
   |    +-- tutor agent ------------------------------------> OpenAI Responses
   |    +-- grounding-verifier agent -----------------------> OpenAI Responses
   |    +-- Gemini translator ------------------------------> Gemini
   |    +-- reinforcement generator/evaluator -------------> OpenAI Responses
   +-- Voice services
   |    +-- ASR --------------------------------------------> OpenAI
   |    +-- TTS --------------------------------------------> 9jaLingo (default)
   |                                                \-------> ElevenLabs/YarnGPT/OpenAI
   +-- Corpus administration (x-admin-ingestion-key)
        +-- POST/GET /api/admin/corpus/*
        +-- PDF temp storage -> BullMQ corpus-ingestion -----> Redis
                                  |
                                  +-- extract/chunk/embed ----> PostgreSQL/pgvector

 PostgreSQL/pgvector: corpus + vectors + runs + traces + voice metrics + reinforcement
 Redis/BullMQ: corpus-ingestion queue/job state
```

The boundaries and arrows in this sketch are taken from the controllers, module bindings, orchestrator, and queue registration; there is no browser-to-provider credential path. [api/src/corpus/corpus.controller.ts] [api/src/tutor/tutor.controller.ts] [api/src/voice/voice.controller.ts] [api/src/tutor/tutor.module.ts] [docs/privacy.md, “Data sent to providers”]

## 3. The tutoring pipeline

### 3.1 Implemented state machine

```text
 created -> running
              |
              v
        query transformation
              |
              v
     deterministic retrieval agent
              |
              +-- no candidates -------------------------------+
              +-- candidates, none >= threshold ---------------+--> refused
              |
              v
           tutor draft
              |
              +-- insufficientEvidence=true ----------------------> refused
              |
              v
       grounding verification (initial)
              |
              +-- grounded=true --> translate --> completed
              |
              +-- grounded=false, revisionRecommended=false ------> refused
              |
              +-- grounded=false, revisionRecommended=true
                              |
                              v
                    one controlled tutor revision
                              |
                              +-- insufficientEvidence=true ------> refused
                              |
                              v
                    grounding verification (revision)
                              |
                              +-- grounded=true -> translate -----> completed
                              +-- grounded=false ------------------> refused

 Any configuration/provider/timeout/schema/citation/budget exception -> failed
 Terminal statuses: completed | refused | failed
```

The persisted status vocabulary is `created`, `running`, `completed`, `refused`, and `failed`. The first two retrieval conditions share the same code branch after the orchestrator re-filters returned candidates, but remain distinguishable as “search returned none” versus “search returned candidates whose `accepted`/score failed policy.” The documented normal-refusal taxonomy is: no candidates, all below threshold, tutor-declared insufficiency, and terminal grounding failure. [api/src/tutor/contracts/tutor-run-state.ts] [api/src/tutor/services/tutor-orchestrator.service.ts, retrieval filtering and refusal] [docs/building-the-stem-ai-tutor.md, “Preserve refusal and safe-failure behavior”]

Failures are not normal refusals: configuration absence, provider errors, timeouts, malformed structured output, unknown citations, or budget exhaustion produce `failed`, clear final/translated answers, and persist a safe structured error. [api/src/tutor/services/tutor-orchestrator.service.ts, catch block] [docs/building-the-stem-ai-tutor.md, “Preserve refusal and safe-failure behavior”]

### 3.2 Grounded-run walkthrough

1. **Run creation.** `CreateTutorRunDto` supplies a trimmed 2–2,000-character English question, an optional unused voice-session link, and a preferred output language defaulting to `pcm`. The store creates a `created` row, then the orchestrator marks it `running` and emits ordered trace events. [api/src/tutor/dto/create-tutor-run.dto.ts] [api/src/tutor/services/tutor-orchestrator.service.ts]
2. **Query transformation.** The query-transformer agent receives `{question, language}` and emits `refinedQuery`, an intent enum, concepts, spelling corrections, and the provider model identifier; the original and transformed forms are persisted together. [api/src/tutor/contracts/workflow.contracts.ts] [api/src/tutor/services/tutor-orchestrator.service.ts]
3. **Retrieval.** The deterministic retrieval agent passes only the refined query plus policy limit and threshold to the registered `curriculum.search` tool. The tool embeds the query, executes hybrid SQL, maps source/topic/score metadata, and returns structured chunks plus token/cost usage. [api/src/tutor/agents/deterministic-retrieval.agent.ts] [api/src/tutor/tools/curriculum-search.tool.ts]
4. **Evidence decision.** The orchestrator accepts only chunks whose `accepted` flag is true and whose numeric `hybridScore` independently meets policy. No accepted evidence terminates as `refused` before tutor or verifier invocation. [api/src/tutor/services/tutor-orchestrator.service.ts, lines 186–217]
5. **Tutor draft.** The tutor receives the original question, language, validated query transformation, and accepted chunks. It emits answer text, citations, a summary, `insufficientEvidence`, and an optional limitation. The orchestrator rejects unknown IDs and replaces citation labels with canonical source title/locator values. [api/src/tutor/contracts/workflow.contracts.ts] [api/src/tutor/services/tutor-orchestrator.service.ts, `enforceCitations`]
6. **Verification.** The verifier receives the original question, answer, canonical citations, the same accepted chunks, attempt type, and whether a revision remains. It emits grounded status, reasons, checked citation IDs, revision recommendation/guidance, and unsupported claims. [api/src/tutor/contracts/workflow.contracts.ts] [api/src/tutor/contracts/tutor-run-state.ts]
7. **Bounded revision decision.** If initially ungrounded and revision is recommended, `RunBudget` increments its single allowed revision and the tutor receives its previous answer plus verifier reasons, guidance, and unsupported-claim summaries without any broader evidence set. The revised draft is citation-enforced and verified once more. [api/src/tutor/services/tutor-orchestrator.service.ts, lines 287–370] [api/src/tutor/policies/harness-policy.service.ts]
8. **Translation and completion.** A grounded answer has internal citation markers removed and is sent to Gemini with target `pcm`, `ig`, `yo`, or `ha`; translation metadata and usage are added to the run budget. Only after successful translation does the run become `completed`, retaining the canonical English `finalAnswer`, the `translatedAnswer`, citations, and grounding result. [api/src/tutor/services/tutor-orchestrator.service.ts, translation/completion] [api/src/tutor/translation/gemini-translation.provider.ts]

### 3.3 Agent and tool interfaces

| Interface/service | One-line responsibility | Source |
|---|---|---|
| `TutorAgent<TInput,TOutput>` | Named agent contract: execute typed input in a run/deadline/tool context and return typed output, usage, and a safe summary | [api/src/tutor/contracts/agent.contract.ts] |
| `TutorTool<TInput,TOutput>` | Named tool contract with explicit input/result validators and typed execution context | [api/src/tutor/contracts/tool.contract.ts] |
| `ToolRegistryService` | Registers tools, rejects unknown/malformed calls, applies deadline-aware timeout/retry policy, accounts usage, and persists safe invocation/trace records | [api/src/tutor/tools/tool-registry.service.ts] |
| `HarnessPolicyService` | Parses and bounds harness timeouts, retries, retrieval settings, and resource ceilings | [api/src/tutor/policies/harness-policy.service.ts] |
| `RunBudget` | Counts agent/tool calls, tokens, estimated cost, retries, revisions, and total latency; throws when a ceiling is crossed | [api/src/tutor/policies/harness-policy.service.ts, `RunBudget`] |

## 4. Data design

### 4.1 Tables and alterations

| Group | Table | Responsibility | Key columns, constraints, and deletion behavior | Source |
|---|---|---|---|---|
| Corpus library | `corpus_sources` | Bibliographic/licence record | UUID PK; required `title`, `licence`; nullable `author`, `publisher`, `source_url` | [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] |
| Corpus library | `curriculum_topics` | Optional curriculum topic identity | UUID PK; unique `(subject, school_level, curriculum, label)`; optional code/description | [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] |
| Corpus library | `corpus_documents` | Uploaded-document metadata and lifecycle | UUID PK; unique SHA-256; source FK `ON DELETE RESTRICT`; queued/processing/ready/failed check; page/error/temp-path fields | [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] |
| Corpus library | `ingestion_runs` | Queue/stage/progress and ingestion counters | UUID PK; document FK `ON DELETE CASCADE`; status/progress checks; job ID, page/chunk/token/topic counters | [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] |
| Corpus library | `corpus_chunks` | Page-located text and embedding row | SHA-256 `char(64)` PK; unique `(document_id, chunk_index)`; document cascade; nullable topic `SET NULL`; `embedding vector(1536)` | [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] |
| Tutor harness | `tutor_runs` | End-to-end run state and outputs | UUID PK; status check; question/language; retrieved JSON; draft/final/citations/grounding/refusal/metrics/errors; later query transformation, unique voice-session FK `SET NULL`, output language, translated answer, translation metadata | [api/src/database/migrations/2026072222000-CreateTutorHarness.ts] [api/src/database/migrations/2026072224000-AddQueryTransformation.ts] [api/src/database/migrations/2026072310000-AddVoiceMetrics.ts] [api/src/database/migrations/2026072610000-AddTranslatedTutorOutput.ts] |
| Tutor harness | `agent_events` | Ordered, safe agent/tool/run trace | UUID PK; unique `(run_id, sequence)`; status check; run FK `ON DELETE CASCADE`; safe summary, latency, token/cost/retry/error metadata | [api/src/database/migrations/2026072222000-CreateTutorHarness.ts] |
| Tutor harness | `tool_invocations` | Per-attempt tool audit and usage | UUID PK; status check; run FK `ON DELETE CASCADE`; input/result summaries, timing, token/cost/retry/error metadata | [api/src/database/migrations/2026072222000-CreateTutorHarness.ts] |
| Voice metrics | `voice_sessions` | ASR/TTS metrics without audio bytes | UUID PK; language; nullable `asr_metrics` and `tts_metrics` JSON; one-to-one optional link from `tutor_runs` | [api/src/database/migrations/2026072310000-AddVoiceMetrics.ts] |
| Reinforcement | `reinforcement_question_sets` | One generated question set per completed tutor run | UUID PK; unique `run_id`; run FK `ON DELETE CASCADE`; JSON items, model, usage | [api/src/database/migrations/2026072412000-AddReinforcementLearning.ts] |
| Reinforcement | `reinforcement_attempts` | Bounded student answers and evaluator output | UUID PK; unique `(question_set_id, question_id, attempt_number)` and unique voice-session link; set cascade; voice session `SET NULL`; answer, correctness, feedback/hint, model/usage/latency | [api/src/database/migrations/2026072412000-AddReinforcementLearning.ts] |

The corpus embedding index is HNSW with `vector_cosine_ops`. Hybrid retrieval adds a GIN English `to_tsvector` index and a GIN `lower(content) gin_trgm_ops` index. [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] [api/src/database/migrations/2026072223000-AddHybridCorpusSearch.ts]

### 4.2 Migration order and policy

1. `CreateCorpusLibrary2026072217000` [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts]
2. `CreateTutorHarness2026072222000` [api/src/database/migrations/2026072222000-CreateTutorHarness.ts]
3. `AddHybridCorpusSearch2026072223000` [api/src/database/migrations/2026072223000-AddHybridCorpusSearch.ts]
4. `AddQueryTransformation2026072224000` [api/src/database/migrations/2026072224000-AddQueryTransformation.ts]
5. `AddVoiceMetrics2026072310000` [api/src/database/migrations/2026072310000-AddVoiceMetrics.ts]
6. `AddReinforcementLearning2026072412000` [api/src/database/migrations/2026072412000-AddReinforcementLearning.ts]
7. `AddTranslatedTutorOutput2026072610000` [api/src/database/migrations/2026072610000-AddTranslatedTutorOutput.ts]

Both runtime and migration data-source configurations set `synchronize: false`; schema changes therefore use explicit migrations. [api/src/app.module.ts] [api/src/database/data-source.ts]

## 5. Corpus / data-collection workflow

1. **Administrative intake.** All `/api/admin/corpus/*` endpoints use `AdminIngestionKeyGuard`. Administration is disabled when `ADMIN_INGESTION_KEY` is absent or still the documented placeholder; otherwise `x-admin-ingestion-key` is compared with `timingSafeEqual`. [api/src/corpus/corpus.controller.ts] [api/src/corpus/guards/admin-ingestion-key.guard.ts]
2. **PDF validation.** The storage service checks four properties: a file exists, MIME is exactly `application/pdf`, the bytes begin `%PDF-`, and the basename ends `.pdf`; it separately enforces `CORPUS_MAX_FILE_SIZE_BYTES`, while multer has a fixed 20 MiB ceiling. The documented default is 20,971,520 bytes. [api/src/corpus/services/upload-storage.service.ts] [api/src/corpus/corpus.controller.ts] [.env.example]
3. **Deduplication and queueing.** The service stores a randomly named temporary PDF, hashes the full bytes with SHA-256, rejects an existing document hash, transactionally creates source/document/ingestion rows, then enqueues only `{documentId, ingestionId}` using the ingestion ID as BullMQ job ID. [api/src/corpus/services/document-upload.service.ts]
4. **Worker execution.** Queue defaults are three attempts with exponential 2,000 ms backoff; the corpus worker itself has concurrency one and releases the temporary PDF after success or final failure. [api/src/app.module.ts] [api/src/corpus/processors/corpus-ingestion.processor.ts]
5. **Page extraction and normalization.** `pdf-parse` extracts individual pages with evaluation disabled and stop-on-error enabled. Text is NFKC-normalized, null bytes removed, spaces collapsed, and excessive newlines reduced. Empty extraction or fewer than 50 extracted characters is rejected; OCR is explicitly not enabled. [api/src/corpus/services/pdf-extractor.service.ts]
6. **Chunking.** Each page is chunked independently, so no chunk crosses a page boundary. Defaults are 2,400 maximum characters and 300-character overlap; splits prefer a sentence boundary within the last 40% of the target, then whitespace, then the proposed end. [api/src/corpus/services/text-chunker.service.ts] [.env.example]
7. **Stable identifiers.** Content hash is SHA-256 of normalized chunk text. Chunk ID is SHA-256 of `documentId:chunkIndex:pageNumber:contentHash`; the token estimate is `ceil(characters/4)`, and the locator is `page N`. [api/src/corpus/services/text-chunker.service.ts]
8. **Embeddings.** Batches default to 50 and are configuration-bounded from 1 to 500. The provider requests `text-embedding-3-small`, 1,536 float dimensions, sorts outputs by provider index, and rejects count/dimension mismatch; startup rejects any configured dimension other than the schema's 1,536. [api/src/corpus/services/corpus-ingestion.service.ts] [api/src/corpus/embeddings/openai-embedding.provider.ts] [api/src/corpus/corpus.constants.ts]
9. **Topic mapping.** When a document supplies a default topic label, the worker finds or creates the `(subject, schoolLevel, curriculum, label)` topic and assigns it to every chunk. Without a label, chunks remain unmapped; there is no automatic topic classifier. [api/src/corpus/services/corpus-ingestion.service.ts, `findOrCreateDefaultTopic`]
10. **Idempotent replacement.** Saving occurs in a transaction that deletes the document's previous chunks and inserts the complete newly prepared set before marking the document/run complete. Stable IDs recur only when document identity, chunk order, page, and normalized content remain the same. [api/src/corpus/services/corpus-ingestion.service.ts] [api/src/corpus/services/text-chunker.service.ts]
11. **CLI.** `npm run ingest` requires file, subject, school level, curriculum, source title, and licence; author, publisher, source URL, topic label, and topic code are optional. It invokes the same upload service and polls the ingestion row every second until completed or failed. [api/src/cli/ingest.ts] [api/package.json, `scripts.ingest`]

### Recorded corpus metadata

The locked fixture manifest records two document entries, both titled **Basic Science Text**, at SS1/NERDC level: one under **Physical Science** and one under **Natural Science**; both declare `CC BY-ND`. The manifest explicitly says that named author, publisher, and source URL are absent. [demo/fixtures/stem-evaluation-v1.json, `corpus.documents` and `corpus.attributionLimitation`]

The live database's present rows are **UNKNOWN** because no database dump or query result representing the current runtime database is part of the repository. The fixture manifest is therefore evidence of the evaluation corpus declaration, not proof of current database contents. [demo/fixtures/stem-evaluation-v1.json] [compose.yaml]

## 6. Retrieval method

The search embeds the input query, restricts candidates to `ready` documents and optional subject/school level, and forms two pools: nearest pgvector cosine candidates and lexical candidates. Each pool is `min(200, max(50, limit×10))`; lexical candidates must first reach a fixed 0.2 lexical score. [api/src/corpus/services/corpus-search.service.ts]

Semantic similarity is `max(0, 1 - cosine_distance)`. Lexical similarity is the greatest of an English full-text match scored as 1/0, whole-query `word_similarity`, and average trigram similarity for non-stopword query terms of at least four characters. Candidate IDs are the SQL `UNION` of semantic and lexical pools. [api/src/corpus/services/corpus-search.service.ts, SQL and `lexicalScoreSql`]

The fused `hybridScore` is `GREATEST(semanticSimilarity, lexicalSimilarity)`. SQL orders by fused score, semantic score, and stable chunk ID and applies top-k **before** application thresholding; the mapped `accepted` flag is then `hybridScore >= threshold`. [api/src/corpus/services/corpus-search.service.ts]

The default public/tool retrieval values are limit `5` and threshold `0.65`, with DTO limits of 1–20 and threshold 0–1. The orchestrator, not SQL, owns the final refusal decision by rechecking `accepted` and the numeric score. [api/src/corpus/dto/search-corpus.dto.ts] [api/src/tutor/policies/harness-policy.service.ts] [api/src/tutor/services/tutor-orchestrator.service.ts]

## 7. Policy, budget, and safety boundaries

### 7.1 Configured limits

| Boundary | Variable / code rule | Repository default | Enforcement source |
|---|---|---:|---|
| Agent attempt timeout | `TUTOR_AGENT_TIMEOUT_MS` | 10,000 ms | [.env.example] [api/src/tutor/policies/harness-policy.service.ts] |
| Tool attempt timeout | `TUTOR_TOOL_TIMEOUT_MS` | 10,000 ms, additionally clipped to the agent deadline | [.env.example] [api/src/tutor/tools/tool-registry.service.ts] |
| Agent-call ceiling | `TUTOR_MAX_AGENT_CALLS` | 6 | [.env.example] [api/src/tutor/policies/harness-policy.service.ts] |
| Agent retries | `TUTOR_MAX_AGENT_RETRIES` | 1 retry | [.env.example] [api/src/tutor/policies/harness-policy.service.ts] |
| Tool retries | `TUTOR_MAX_TOOL_RETRIES` | 1 retry | [.env.example] [api/src/tutor/policies/harness-policy.service.ts] |
| Run token ceiling | `TUTOR_MAX_TOKENS` | 32,000 | [.env.example] [api/src/tutor/policies/harness-policy.service.ts] |
| Estimated run-cost ceiling | `TUTOR_MAX_ESTIMATED_COST_USD` | USD 0.10 | [.env.example] [api/src/tutor/policies/harness-policy.service.ts] |
| Revision cap | hard-coded `maxRevisions` | 1 | [api/src/tutor/policies/harness-policy.service.ts] |
| Input question | DTO length | 2–2,000 characters; English input only | [api/src/tutor/dto/create-tutor-run.dto.ts] |
| Canonical tutor answer | `TUTOR_ANSWER_MAX_CHARACTERS` | 8,000 characters | [api/src/tutor/contracts/tutor-limits.ts] |
| Translation | `GEMINI_TRANSLATION_TIMEOUT_MS`, `GEMINI_TRANSLATION_MAX_OUTPUT_TOKENS` | 30,000 ms; 4,000 tokens | [.env.example] [api/src/tutor/translation/gemini-translation.provider.ts] |
| Reinforcement generation/evaluation | question count / generation attempts / attempts per question / timeout | 3 / 2 / 3 / 30,000 ms | [.env.example] [api/src/tutor/reinforcement/reinforcement-policy.service.ts] |
| Voice rate limits | `ASR_REQUESTS_PER_MINUTE`, `TTS_REQUESTS_PER_MINUTE` | 10 each per IP per 60-second in-process bucket | [.env.example] [api/src/voice/services/voice-rate-limit.service.ts] [api/src/voice/voice.controller.ts] |
| ASR provider timeout | `ASR_TIMEOUT_MS` | 20,000 ms | [.env.example] [api/src/voice/services/transcription.service.ts] |
| Audio upload size | `VOICE_MAX_AUDIO_BYTES` | 8,388,608 bytes; multer's outer ceiling is 25 MiB | [.env.example] [api/src/voice/policies/voice-policy.service.ts] [api/src/voice/voice.controller.ts] |
| Recording duration | `VOICE_MAX_RECORDING_SECONDS` | 30 seconds; policy may not exceed 120 seconds | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| 9jaLingo request text | `NAIJALINGO_MAX_INPUT_CHARACTERS` | 8,000, additionally capped at twice the 8,000-character tutor-answer limit | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| ElevenLabs request text | `ELEVEN_LABS_MAX_INPUT_CHARACTERS` plus model/tutor caps | configured 40,000, effective default 8,000 | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| YarnGPT request text | `YARN_GPT_MAX_INPUT_CHARACTERS` plus hard cap | 2,000 | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| OpenAI TTS request text | `TTS_MAX_INPUT_CHARACTERS` plus tutor cap | 4,096 | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| Provider TTS timeout | provider-specific timeout | 9jaLingo 120,000 ms; ElevenLabs 120,000 ms; YarnGPT 30,000 ms; OpenAI 20,000 ms | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| Application TTS attempt timeout | `TTS_APPLICATION_TIMEOUT_MS` | `.env.example`: 300,000 ms; code fallback if absent: 65,000 ms | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| 9jaLingo chunk target | `TTS_CHUNK_MIN/PREFERRED/MAX_CHARACTERS` | 400 / 550 / 700 | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| TTS transient retry | `TTS_CHUNK_MAX_RETRIES`, `TTS_CHUNK_RETRY_BASE_DELAY_MS` | 2 retries; 500 ms exponential base | [.env.example] [api/src/voice/services/speech.service.ts, `synthesizeChunk`] |
| Partial TTS cache | TTL / process-memory byte cap | 900,000 ms / 67,108,864 bytes | [.env.example] [api/src/voice/services/speech-chunk-cache.service.ts] |
| TTS response ceilings | per-provider and assembled total | 9jaLingo/ElevenLabs 20,971,520 bytes each; YarnGPT 10,485,760; total 25,165,824 | [.env.example] [api/src/voice/policies/voice-policy.service.ts] |
| Corpus upload | `CORPUS_MAX_FILE_SIZE_BYTES` | 20,971,520 bytes | [.env.example] [api/src/corpus/services/upload-storage.service.ts] |
| Corpus queue | BullMQ defaults | 3 attempts; exponential 2,000 ms base; retain 100 completed and 500 failed jobs | [api/src/app.module.ts] |
| SSE heartbeat | `SSE_HEARTBEAT_INTERVAL_MS` | 15,000 ms | [.env.example] [api/src/tutor/tutor.controller.ts] |

There is no whole-tutor-run wall-clock timeout; the run is bounded by per-attempt deadlines plus call/token/cost/revision ceilings. [api/src/tutor/policies/harness-policy.service.ts] [docs/building-the-stem-ai-tutor.md, harness policy discussion]

### 7.2 TTS timeout diagnosis and chunked workflow

`SPEECH_PROVIDER_TIMEOUT` originates inside `NaijaLingoSpeechProvider`: it creates `AbortSignal.timeout(NAIJALINGO_TIMEOUT_MS)` and emits that retryable code when the provider timer/abort fires. A 504 response is separately classified as `SPEECH_PROVIDER_GATEWAY_TIMEOUT`. By contrast, `SpeechService` owns a `Promise.race` timer using `TTS_APPLICATION_TIMEOUT_MS`; when that timer fires it aborts the provider signal and generates `SPEECH_APPLICATION_TIMEOUT`. These are distinct failure sources even though both become an HTTP gateway-timeout response. [api/src/voice/providers/naijalingo-speech.provider.ts] [api/src/voice/services/speech.service.ts, `callProviderWithTimeout` and `throwHttpFailure`]

Only the current 9jaLingo path is chunked. Punctuation is NFC-normalized without stripping Igbo/Yoruba diacritics; `→` becomes “to”, em dash becomes a comma, smart quotes become ASCII quotes, and ellipsis becomes three periods. Natural breaks are selected in the order paragraph, sentence, clause, then safe whitespace; bracket/parenthesis depth, decimal points, listed abbreviations, initials, and numbered-list markers are protected. A single unbroken token can exceed the configured maximum rather than being split mid-word. [api/src/voice/services/speech-text-chunker.ts] [api/src/voice/services/speech-text-chunker.spec.ts]

Chunks execute sequentially in a numeric `for` loop. Retry is limited to provider errors marked retryable—9jaLingo classifies 429, 502, 503, 504, network failures, provider timeout, and generic 5xx as retryable, while authentication, validation, inference/input rejection, invalid audio/content type, and oversized responses are not. Backoff is `base × 2^retryCount`. [api/src/voice/services/speech.service.ts] [api/src/voice/providers/naijalingo-speech.provider.ts] [api/src/voice/providers/speech-provider.error.ts]

Successful chunks are cached by voice-session ID, a SHA-256 fingerprint of provider/model/voice/format/language/text, and chunk index. Metrics are persisted after every successful chunk and at failure, but audio cache state is only process memory; a retry in the same process can resume at the failed chunk, while restart or eviction requires regeneration. [api/src/voice/services/speech.service.ts] [api/src/voice/services/speech-chunk-cache.service.ts] [api/src/voice/services/voice-session.service.ts]

The API contract returns one `SpeechResult.audio` buffer and one HTTP audio body, not a playlist. Because 9jaLingo is constrained to WAV, the implementation uses a format-aware assembler: it parses RIFF chunks, permits PCM integer or IEEE-float WAV, verifies identical `fmt ` payloads, concatenates only `data` payloads in order, and writes a new valid RIFF/WAVE header. It does not concatenate encoded MP3/WAV files naïvely. [api/src/voice/contracts/voice.contracts.ts] [api/src/voice/services/wav-audio-assembler.ts] [api/src/voice/voice.controller.ts]

Pidgin maps to `lang: pcm` and the `pcm` voice; the default voice map is `pcm→ada_pcm`, `ig→adaeze_ig`, `yo→adeola_yo`, and `ha→aisha_ha`. [api/src/voice/policies/voice-policy.service.ts] [api/src/voice/providers/naijalingo-speech.provider.ts]

Persisted TTS metrics include total character count, chunk count, per-chunk characters/latency/retries/output bytes/success/failure/cache status, failed chunk index, total synthesis latency, total output bytes, provider failure code, and provider/model/voice/format/cost metadata. [api/src/voice/contracts/voice.contracts.ts] [api/src/voice/services/speech.service.ts, `metricsFor`]

### 7.3 Trust boundaries

- Provider, database, Redis, and corpus-admin credentials are read only by server-side code; the browser calls the API and does not receive provider keys. [.env.example] [docs/privacy.md, “Data sent to providers”]
- ASR text is editable and must be explicitly reviewed/confirmed before submission; voice-session IDs can be linked only once to a run or reinforcement attempt. [web/src/App.tsx] [api/src/voice/services/voice-session.service.ts]
- Speech accepts only a UUID run ID. It reloads the row and requires `completed`, non-refused, non-null final and translated answers, grounded verification, non-empty speakable text, and provider-effective length. [api/src/voice/voice.controller.ts] [api/src/voice/services/speech.service.ts]
- The orchestrator raises `UNKNOWN_CITATION` for a cited chunk outside the accepted set and replaces model-supplied source labels with database metadata before verification/persistence. [api/src/tutor/services/tutor-orchestrator.service.ts, `enforceCitations`]
- Tutor/verifier/translation prompts delimit retrieved or lesson text as untrusted content and instruct the provider not to execute instructions found inside it. [api/src/tutor/providers/openai-tutor.provider.ts] [api/src/tutor/providers/openai-grounding-verifier.provider.ts] [api/src/tutor/translation/gemini-translation.provider.ts]
- Microphone bytes and generated audio are transient and are not stored in PostgreSQL, Redis, BullMQ, upload storage, logs, evaluation exports, or the repository; voice sessions retain metrics only. The in-process successful-chunk cache is the one transient application cache. [docs/privacy.md, “Application persistence”] [api/src/voice/services/speech-chunk-cache.service.ts]
- Persisted/logged material includes confirmed questions, canonical answers, accepted evidence/citations, safe trace/tool summaries, usage/cost/latency, reinforcement state, ingestion identifiers/status, and safe failure codes/messages. Tool input summaries record query length and filters rather than raw tool input; the ingestion worker logs ingestion IDs and safe error messages. [docs/privacy.md] [api/src/tutor/tools/tool-registry.service.ts] [api/src/corpus/processors/corpus-ingestion.processor.ts]
- Raw provider bodies, authorization values, audio bytes, and hidden reasoning are not part of the persistence contracts; the OpenAI response client sets `store: false`. [docs/privacy.md] [api/src/tutor/providers/openai-model-response.client.ts]

## 8. Verification and testing workflow

### 8.1 Current suite inventory and authoring checks

The current API unit run (`npm test --workspace api`) completed with **34 suites and 174 passing tests**; the current browser run completed with **4 files and 15 passing tests**. These commands are the workspace scripts over the present 34 `*.spec.ts` files and four browser `*.test.ts(x)` files. [api/package.json, `scripts.test` and Jest config] [api/src] [web/package.json, `scripts.test`] [web/src/App.test.tsx] [web/src/recorder.test.tsx] [web/src/citationMarkers.test.ts] [web/src/lessonText.test.ts]

The root API+web lint command and the production build command completed during dossier authoring. The repository-defined commands are `npm run lint` and `npm run build`. [package.json, `scripts.lint` and `scripts.build`] [api/package.json] [web/package.json]

The database-backed integration suite's current pass status is **UNKNOWN**: no post-9jaLingo integration result is committed, and the suite requires a runnable Nest HTTP listener plus PostgreSQL and Redis. The present integration surface is three files with seven test cases: two health tests, one corpus-ingestion test, and four tutor/voice/reinforcement persistence tests. [api/test/health.e2e-spec.ts] [api/test/corpus-ingestion.e2e-spec.ts] [api/test/tutor-harness.e2e-spec.ts] [api/package.json, `scripts.test:integration`]

### 8.2 Coverage and provider isolation

The health suite covers liveness and database readiness. Corpus integration uploads a PDF, queues it, extracts/chunks/embeds/stores it, and retrieves it. Tutor integration covers a completed grounded run with traces/tools, a safely failed run, browser-audio/voice metrics/canonical speech, and bounded reinforcement attempts. [api/test/health.e2e-spec.ts] [api/test/corpus-ingestion.e2e-spec.ts] [api/test/tutor-harness.e2e-spec.ts]

Automated tests make no paid calls: provider clients, embeddings, agents, `fetch`, Gemini, and model response clients are faked or mocked; CI provides empty provider credentials, and evaluation defaults to deterministic mock mode. [api/src/tutor/providers/openai-model-response.client.spec.ts] [api/src/tutor/services/tutor-orchestrator.service.spec.ts] [api/src/voice/providers/naijalingo-speech.provider.spec.ts] [api/test/tutor-harness.e2e-spec.ts] [.github/workflows/ci.yml] [demo/scripts/run-demo.mjs]

The 9jaLingo-specific tests cover short text, multi-paragraph order, long clauses, Unicode normalization and diacritics, abbreviation/list protection, `pcm` mapping, timeout/status classification, transient retry, non-retryable authentication/validation/inference failures, partial failure/resume, per-chunk/partial metrics, oversized input, and ordered format-aware WAV assembly. [api/src/voice/services/speech-text-chunker.spec.ts] [api/src/voice/providers/naijalingo-speech.provider.spec.ts] [api/src/voice/services/speech.service.spec.ts] [api/src/voice/services/wav-audio-assembler.spec.ts]

CI checks out the repository on Ubuntu 24.04, selects Node from `.nvmrc`, runs `npm ci`, lint, unit/browser tests, migrations run/show, PostgreSQL/Redis integration tests, production builds, and the deterministic mock evaluation. [`.github/workflows/ci.yml`]

The acceptance command sequence encoded by CI is: [.github/workflows/ci.yml] [package.json]

```text
npm ci
npm run lint
npm test
npm run migration:run
npm run migration:show
npm run test:integration
npm run build
npm run demo -- --mode mock
```

[.github/workflows/ci.yml] [package.json]

Mock evaluation validates fixtures, scoring, denominators, and exports without external calls. Live evaluation requires explicit `DEMO_LIVE_CONFIRM=YES`, server-side credentials, a running populated application, and bounded HTTP retries; it is intended to measure real application/provider behavior. [demo/scripts/run-demo.mjs] [demo/README.md]

## 9. Evaluation harness design

The locked fixture set contains ten English cases: six `supported`, two `out_of_syllabus`, one `misspelling_or_conversational`, and one `related_insufficient_evidence`. Validation enforces at least those category counts and unique fixture IDs. [demo/fixtures/stem-evaluation-v1.json] [demo/scripts/run-demo.mjs, `validateFixtures`]

Each fixture pins an ID, category, question, language, expected completed/refused disposition, expected curriculum topic and persisted topic label, expected source, expected evidence locators and stable chunk IDs, required concepts, forbidden unsupported claims, whether ASR is involved, and a ground-truth justification. [demo/fixtures/stem-evaluation-v1.json]

| Exported aggregate | Numerator / denominator design | Source |
|---|---|---|
| Fixture and failed-run counts | All results; failed actual dispositions | [demo/scripts/run-demo.mjs, `aggregate`] |
| Disposition accuracy | Correct expected/actual disposition / all fixtures | [demo/scripts/run-demo.mjs, `aggregate`] |
| Retrieval hit rate | Expected-source hits / expected completions plus the related-insufficient-evidence boundary | [demo/scripts/run-demo.mjs, `aggregate`] |
| Correct refusal rate | Actual refusals / fixtures expected to refuse | [demo/scripts/run-demo.mjs, `aggregate`] |
| Incorrect refusal rate | Actual refusals / fixtures expected to complete | [demo/scripts/run-demo.mjs, `aggregate`] |
| Structural citation integrity | Expected completions whose citations all reference retrieved IDs / expected completions | [demo/scripts/run-demo.mjs, `scoreResult` and `aggregate`] |
| Grounded completion rate | Expected completions that completed and verifier marked grounded / expected completions | [demo/scripts/run-demo.mjs, `aggregate`] |
| Revision rate | Runs with one or more revisions / all fixtures | [demo/scripts/run-demo.mjs, `aggregate`] |
| Latency | Median and p95 total latency over all fixtures | [demo/scripts/run-demo.mjs, `aggregate` and `percentile`] |
| Cost | Median/total only when all run costs are available; known USD subtotals and unavailable-run count are also exported | [demo/scripts/run-demo.mjs, `aggregate`] |
| Provider failures | TTS failure or non-null safe run error / all results as a count | [demo/scripts/run-demo.mjs, `aggregate`] |
| TTS synthesis success | Successful TTS / cases where TTS was attempted | [demo/scripts/run-demo.mjs, `aggregate`] |
| End-to-end voice success | Expected completions with successful TTS / expected completions | [demo/scripts/run-demo.mjs, `aggregate`] |
| Median TTS latency | Median latency over successful TTS attempts | [demo/scripts/run-demo.mjs, `aggregate`] |

Each run creates a new results directory containing manifest JSON, machine-readable results JSON, CSV, a Chapter 4 Markdown summary, and an intentionally unfilled manual-grounding-review JSON. [demo/scripts/run-demo.mjs] [demo/README.md]

The manifest captures run/time/mode, Git commit and dirty state, application and fixture versions, corpus declaration, retrieval threshold/top-k, exact tutor/verifier/query-transformer/embedding/ASR/TTS pins, TTS format/voice/limit/pricing assumptions, and whether external calls were made; it excludes secrets. [demo/scripts/run-demo.mjs, `buildManifest`]

The manual rubric records reviewer/status/date plus, per completed answer, whether material claims are supported, the original question is answered, citations identify relevant passages, unsupported external facts are absent, secondary-school language is suitable, analogies are identified, and free notes. Null is not a pass, and model verification is not human review. [demo/scripts/run-demo.mjs, `manualReviewTemplate`] [demo/README.md, “Manual review and scope”]

The evaluation harness defaults to `naijalingo`, records the configured model, Nigerian Pidgin voice, WAV format, input limit and pricing metadata in its manifest, validates the 9jaLingo key before live mode, and explicitly requests `preferredLanguage: "pcm"` from the tutor API. ElevenLabs, YarnGPT, and OpenAI remain selectable alternatives. [demo/scripts/run-demo.mjs, `validateLiveConfiguration`, `ttsConfiguration`, `buildManifest`, and `liveResult`] [.env.example, `TTS_PROVIDER` and `NAIJALINGO_*`]

## 10. Divergence log

This comparison treats the listed “original design” items as baselines supplied for the methodology comparison and classifies only the implemented alternative evidenced in this repository.

| Original design item | Status | Implemented alternative and repository-grounded rationale | Source |
|---|---|---|---|
| (a) Single-agent loop | **Replaced** | An explicit orchestrator sequences a model query transformer, deterministic retrieval agent/tool, model tutor, independent model verifier, optional one-shot revision, and translation; typed DI contracts allow implementations to change without changing workflow policy/persistence | [api/src/tutor/tutor.module.ts] [api/src/tutor/services/tutor-orchestrator.service.ts] [docs/building-the-stem-ai-tutor.md, Milestone 4 architecture] |
| (b) Simple vector-only retrieval | **Extended** | Hybrid candidate pooling combines pgvector cosine search with English full-text and trigram search, then fuses with `GREATEST`; this retains semantic retrieval while addressing spelling/lexical matches | [api/src/corpus/services/corpus-search.service.ts] [api/src/database/migrations/2026072223000-AddHybridCorpusSearch.ts] |
| (c) Prompt-level grounding only | **Replaced** | Grounding is enforced by accepted-evidence filtering, canonical citation replacement/unknown-ID rejection, and a separate verifier with one bounded revision | [api/src/tutor/services/tutor-orchestrator.service.ts] [docs/building-the-stem-ai-tutor.md, “Preserve citation and final-answer ownership”] |
| (d) No reinforcement stage | **Extended** | Optional post-answer question generation and answer evaluation have dedicated endpoints, policy, tables, and voice-session linkage; existing runs remain valid without a question set | [api/src/tutor/tutor.controller.ts] [api/src/tutor/reinforcement/reinforcement.service.ts] [api/src/database/migrations/2026072412000-AddReinforcementLearning.ts] |
| (e) English-only output | **Extended** | Questions/retrieval remain English, but grounded output is translated to Nigerian Pidgin, Igbo, Yoruba, or Hausa and then synthesized using the matching 9jaLingo language/voice | [api/src/tutor/dto/create-tutor-run.dto.ts] [api/src/tutor/translation/translation.contracts.ts] [api/src/voice/policies/voice-policy.service.ts] |
| (f) Single TTS provider (OpenAI) | **Replaced** | Dependency injection selects 9jaLingo by default, with ElevenLabs, YarnGPT, and OpenAI retained as explicit alternatives; the provider abstraction keeps the controller/service contract stable | [api/src/voice/voice.module.ts] [api/src/voice/contracts/voice.contracts.ts] [.env.example] |
| (g) No query transformation | **Extended** | A narrow transformer corrects/reframes only the retrieval query while the tutor still receives the original question and validated transformation context | [api/src/tutor/query-transformer/openai-query-transformer.provider.ts] [api/src/tutor/services/tutor-orchestrator.service.ts] [docs/building-the-stem-ai-tutor.md, query-transformation design] |

Deliberately excluded or bounded features remain visible: OCR is absent; no student accounts or student study exist; only English input/ASR is accepted; there is no unbounded reflection loop; audio is not persisted; and the application does not use ElevenLabs STT, agents, voice cloning, speech-to-speech, or reinforcement products. [api/src/corpus/services/pdf-extractor.service.ts] [api/src/tutor/dto/create-tutor-run.dto.ts] [api/src/tutor/policies/harness-policy.service.ts] [docs/privacy.md]

## 11. Figure source material

### 11.1 Use-case sketch

```text
              +----------------------------------------------+
              |              STEM AI Tutor                   |
 Student ---->| (Ask question)                               |
 Student ---->| (Review/edit transcript and confirm)         |
 Student ---->| (Receive grounded written/spoken answer)     |
 Student ---->| (Complete learning check)                    |
              |                                              |
 Administrator| (Upload corpus PDF)                          |
 Administrator| (Inspect documents/ingestions)               |
 Administrator| (Search corpus)                              |
              +----------------------------------------------+
```

Student cases come from the browser and tutor/voice/reinforcement controllers; administrator cases are all protected under `/api/admin/corpus`. [web/src/App.tsx] [api/src/tutor/tutor.controller.ts] [api/src/voice/voice.controller.ts] [api/src/corpus/corpus.controller.ts]

### 11.2 Component/architecture sketch

```text
 [React browser]
      |
      | REST + SSE
      v
 [NestJS API]
   |-- [Voice] -------- OpenAI ASR / selected TTS
   |-- [Tutor orchestrator]
   |      |-- transformer -> retrieval tool -> tutor -> verifier -> translator
   |      `-- reinforcement generator/evaluator
   |-- [Corpus admin/worker] ---- BullMQ ---- [Redis]
   |
   `---------------------------------------- [PostgreSQL + pgvector + pg_trgm]
                                               |
                                               `-- corpus, runs, metrics, traces
```

This redraw source reflects the module composition and provider bindings, with Redis restricted to corpus queueing and PostgreSQL as the durable application store. [api/src/app.module.ts] [api/src/corpus/corpus.module.ts] [api/src/tutor/tutor.module.ts] [api/src/voice/voice.module.ts]

### 11.3 Pipeline activity/state sketch

```text
 [question]
     |
 [transform query]
     |
 [hybrid retrieve] -- no sufficient evidence --> [refused]
     |
 [draft from evidence] -- insufficient --------> [refused]
     |
 [verify grounding]
     | grounded
     +-----------------------------> [translate] -> [completed]
     |
     | ungrounded + revise
 [one revision using same evidence]
     |
 [verify once more] -- ungrounded --------------> [refused]
     |
 [translate] -> [completed]

 exception/timeout/schema/citation/budget breach ---------> [failed]
```

The activity sketch follows the orchestrator branches and hard-coded single revision. [api/src/tutor/services/tutor-orchestrator.service.ts] [api/src/tutor/policies/harness-policy.service.ts]

### 11.4 ER outline

```text
 corpus_sources 1 ----< corpus_documents 1 ----< ingestion_runs
                              |
                              `----< corpus_chunks >---- 0..1 curriculum_topics

 tutor_runs 1 ----< agent_events
     |      1 ----< tool_invocations
     |      0..1 -- 1 voice_sessions
     |
     `------ 0..1 reinforcement_question_sets
                         |
                         `----< reinforcement_attempts >---- 0..1 voice_sessions

 corpus_chunks.embedding = vector(1536)
 tutor_runs also carries query-transformation and translated-output columns
```

The relationship directions, uniqueness, cascades, nullable links, and later tutor-run columns are defined by the seven explicit migrations. [api/src/database/migrations/2026072217000-CreateCorpusLibrary.ts] [api/src/database/migrations/2026072222000-CreateTutorHarness.ts] [api/src/database/migrations/2026072310000-AddVoiceMetrics.ts] [api/src/database/migrations/2026072412000-AddReinforcementLearning.ts] [api/src/database/migrations/2026072610000-AddTranslatedTutorOutput.ts]
