# Continuous integration

The CI workflow is intentionally credential-free and makes no paid provider
calls. It selects `TTS_PROVIDER=naijalingo` with an empty 9jaLingo key so
deterministic tests prove fail-closed configuration while mocks and provider
fakes exercise the successful path.

The workflow runs:

```text
API and web lint
API unit and web tests
explicit TypeORM migrations with synchronize=false
PostgreSQL/pgvector and Redis integration tests
NestJS and Vite production builds
provider-generic mock evaluation
```

9jaLingo adapter and speech-service tests replace `fetch` and cover
authentication, language-specific voices, request fields, timeouts, HTTP error
mapping, WAV validation, chunking, retry, partial resume, and format-aware WAV
assembly. Mock evaluation writes a new unique result directory and makes no
OpenAI, 9jaLingo, ElevenLabs, or YarnGPT request.

Live evaluation is deliberately excluded from CI. It requires an explicitly
confirmed local run with a populated corpus, valid server-side provider access,
and an author listening assessment. Deployment is also excluded and remains a
manual repository-owner task.
