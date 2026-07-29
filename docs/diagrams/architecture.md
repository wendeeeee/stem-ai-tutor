# High-Level System Architecture

<!--
Derived from:
  api/src/main.ts                                  (global 'api' prefix, CORS, exposed TTS headers)
  api/src/app.module.ts                            (TypeORM/Postgres, BullMQ/Redis, feature module list)
  api/src/health/health.module.ts                  (HealthModule)
  api/src/corpus/corpus.module.ts                  (CorpusModule, EMBEDDING_PROVIDER seam, ingestion queue)
  api/src/tutor/tutor.module.ts                    (TutorModule, all provider/agent injection tokens)
  api/src/voice/voice.module.ts                    (VoiceModule, TRANSCRIPTION_PROVIDER / SPEECH_PROVIDER seam)
  api/src/tutor/tutor.constants.ts                 (injection token names)
  api/src/voice/voice.constants.ts                 (injection token names)
  api/src/tutor/translation/translation.contracts.ts (TranslationProvider, output languages)
  api/src/voice/contracts/voice.contracts.ts       (TranscriptionProvider, SpeechProvider)
  api/src/corpus/embeddings/embedding-provider.ts  (EmbeddingProvider)
  api/src/database/migrations/*.ts                 (pgvector, pg_trgm)
  web/src/api.ts, web/src/App.tsx, web/src/recorder.ts (browser client responsibilities)
-->

```mermaid
flowchart TB
    subgraph client["Browser client — React + Vite (web/)"]
        rec["recorder.ts<br/>push-to-talk capture"]
        app["App.tsx<br/>transcript review, SSE trace view,<br/>evidence + citations, audio playback,<br/>reinforcement check"]
        sdk["api.ts<br/>fetch + SSE reader"]
        rec --> app --> sdk
    end

    subgraph api["NestJS API (api/src) — global prefix /api"]
        health["HealthModule<br/>GET /api/health, /api/health/live"]
        voice["VoiceModule<br/>POST /api/voice/transcriptions<br/>POST /api/tutor/runs/:runId/speech"]
        tutor["TutorModule<br/>POST /api/tutor/runs, /stream<br/>GET /api/tutor/runs/:runId<br/>+ :runId/reinforcement"]
        corpus["CorpusModule<br/>POST/GET /api/admin/corpus/*<br/>(AdminIngestionKeyGuard)"]

        orch["TutorOrchestratorService<br/>staged run, budgets, trace"]
        tutor --- orch
    end

    subgraph seam["Provider seam — injection tokens bind interfaces to adapters"]
        direction LR
        t1["TRANSCRIPTION_PROVIDER<br/>TranscriptionProvider"]
        t2["SPEECH_PROVIDER<br/>SpeechProvider (chosen by policy)"]
        t3["QUERY_TRANSFORMER_PROVIDER<br/>QueryTransformerProvider"]
        t4["TUTOR_PROVIDER<br/>TutorProvider"]
        t5["GROUNDING_VERIFIER_PROVIDER<br/>GroundingVerifierProvider"]
        t6["TRANSLATION_PROVIDER<br/>TranslationProvider"]
        t7["EMBEDDING_PROVIDER<br/>EmbeddingProvider"]
        t8["REINFORCEMENT_QUESTION_PROVIDER<br/>REINFORCEMENT_EVALUATION_PROVIDER"]
    end

    subgraph data["Stateful infrastructure"]
        pg[("PostgreSQL 16<br/>pgvector — vector(1536) HNSW<br/>pg_trgm + tsvector GIN")]
        redis[("Redis + BullMQ<br/>corpus ingestion queue")]
    end

    subgraph ext["External provider surface — labelled by role"]
        asr(["Speech-to-text<br/>(OpenAiTranscriptionProvider)"])
        qt(["Query-refinement LLM<br/>(OpenAiQueryTransformerProvider)"])
        tut(["Tutor-answer LLM<br/>(OpenAiTutorProvider)"])
        ver(["Grounding-verification LLM<br/>(OpenAiGroundingVerifierProvider)"])
        emb(["Text-embedding service<br/>(OpenAiEmbeddingProvider)"])
        tr(["Low-resource-language translation<br/>(GeminiTranslationProvider)"])
        tts(["Text-to-speech<br/>(NaijaLingo / ElevenLabs /<br/>YarnGPT / OpenAI adapters)"])
        rein(["Learning-check LLM<br/>(question + answer evaluation)"])
    end

    sdk -->|"multipart audio, JSON, SSE"| voice
    sdk --> tutor
    sdk --> health

    voice --> t1 --> asr
    voice --> t2 --> tts
    orch --> t3 --> qt
    orch --> t4 --> tut
    orch --> t5 --> ver
    orch --> t6 --> tr
    orch -->|"curriculum.search tool"| corpus
    corpus --> t7 --> emb
    tutor --> t8 --> rein

    corpus -->|"enqueue ingestion job"| redis
    redis -->|"CorpusIngestionProcessor"| corpus
    corpus --> pg
    tutor --> pg
    voice --> pg
    health --> pg
```

**Figure caption.** The system is a three-tier, provider-agnostic architecture. A React/Vite browser client
(`web/`) owns only presentation concerns: microphone capture, explicit transcript review before any tutor run
starts, live rendering of the server-sent trace, display of retrieved evidence and citations, audio playback of
the synthesised answer, and the post-answer learning check. All reasoning, grounding, and persistence happen
server-side in a NestJS API exposed under the global `/api` prefix, composed of four feature modules —
`HealthModule`, `CorpusModule` (admin-key-guarded ingestion and hybrid search), `TutorModule` (the orchestrated
grounded run and reinforcement endpoints), and `VoiceModule` (transcription and speech synthesis). State lives in
PostgreSQL 16 with the `vector` extension (a 1 536-dimension embedding column indexed by HNSW under cosine
distance) and `pg_trgm` alongside a `tsvector` GIN index for the lexical half of hybrid retrieval; Redis backs a
BullMQ queue that decouples PDF ingestion from the request path. Every external dependency is reached only
through an explicit provider seam: a NestJS injection token (for example `TUTOR_PROVIDER`, `SPEECH_PROVIDER`,
`EMBEDDING_PROVIDER`) binds a narrow TypeScript interface to a concrete vendor adapter, so a vendor can be
swapped by re-binding one token in a module. Note two points where the code diverges from what a reader might
assume: the speech seam is bound by a `useFactory` (`selectSpeechProvider`) that picks one of four adapters from
runtime policy rather than a fixed class, and the reinforcement providers are bound in `TutorModule` rather than
in a separate module.
