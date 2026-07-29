# Architecture and data boundaries

## Current multilingual tutor-output voice path

```text
browser microphone ──transient audio──► OpenAI ASR
        │                                  │
        │                         editable transcript
        ▼                                  ▼
 confirmed English question ──► query transformer ──► hybrid retrieval
                                                    │
                                                    ▼
                                              tutor model
                                                    │
                                                    ▼
                                      independent grounding verifier
                                                    │
             refused / failed ◄─────────────────────┤
             (text only)                            │ completed + grounded
                                                    ▼
                            canonical persisted English finalAnswer
                                                    │
                                                    ▼
                                 Gemini translation (pcm/ig/yo/ha)
                                                    │
                                                    ▼
                                    persisted translatedAnswer
                                                    │ runId only
                                                    ▼
                                      POST /tutor/runs/:runId/speech
                                                    │
                              server loads and rechecks persisted run
                                                    │
                                   deterministic Markdown cleanup
                                                    │ translated text only
                                                    ▼
                                      9jaLingo TTS API v1
                                                    │
                                         transient WAV response
                                                    ▼
                                         browser playback controls
```

Gemini receives only the completed, independently grounded English answer and
the selected target language. The verified English answer remains immutable;
the translation is persisted separately with safe model, language, token,
character, cost, and latency metadata.

9jaLingo is not reachable through an arbitrary-text browser route. The browser
supplies only a tutor run ID. The speech service requires a persisted completed,
non-refused, independently grounded run with both the canonical answer and a
non-null translated answer. It selects the configured speaker for `pcm`, `ig`,
`yo`, or `ha`.

## Provider responsibilities

| Responsibility | Provider or component |
|---|---|
| Student audio transcription | OpenAI ASR |
| Query transformation | Existing OpenAI model adapter |
| Embeddings | Existing OpenAI embedding adapter |
| Retrieval | PostgreSQL, pgvector, full text, and trigram matching |
| Tutor answer | Existing OpenAI tutor adapter |
| Grounding verification | Existing independent OpenAI verifier adapter |
| Grounded-answer translation | Google Gemini |
| Translated completed-answer voice | 9jaLingo TTS by default |
| Explicit TTS alternatives | ElevenLabs, YarnGPT, or OpenAI through `TTS_PROVIDER` |
| Reinforcement generation/evaluation | Existing OpenAI reinforcement adapters |

Gemini performs translation only. It receives no microphone audio, retrieved
chunks, hidden prompts, reasoning, reinforcement content, or account data.
9jaLingo performs speech synthesis only. It receives no student question,
microphone audio, ASR transcript, retrieved evidence, canonical English answer,
citations as metadata, or reinforcement content.

## Persisted and transient data

PostgreSQL stores curriculum metadata/chunks, tutor runs, safe trace events,
canonical English answers/citations, translated answers and safe translation
metadata, reinforcement state, and JSONB voice metrics.
Voice metrics record provider, API version, model, voice ID and safe display
name, output format, input characters, output bytes, latency, success/failure
code, provider `character-cost` when valid, and dated pricing estimates.

Microphone bytes and synthesized audio are transient. They are not written to
PostgreSQL, Redis, BullMQ, upload storage, logs, evaluation exports, or the
repository. Evaluation scripts count live response bytes and discard the
buffer.

## Trust boundaries and limits

- The canonical English answer is limited to 8,000 characters. Gemini output
  is schema-validated, non-empty, bounded, and stored separately.
- Translation failure fails the run safely; untranslated or browser-supplied
  text never falls through to speech.
- The 9jaLingo adapter uses non-streaming `POST /v1/audio/speech` with the
  persisted translation, target language code, configured speaker ID, and WAV
  response format.
- Provider responses are untrusted. 9jaLingo responses require success,
  matching WAV content type, a non-empty bounded body, and RIFF/WAVE magic
  bytes.
  Declared and streamed size limits are enforced.
- Abort signals, explicit timeouts, request-rate limits, and safe error mapping
  apply at the server boundary.
- No API key, answer text, raw provider body, or raw provider error is logged or
  exported.
- A translation or speech-provider failure never triggers automatic fallback.
  Written evidence,
  citations, trace, and reinforcement UI remain available.

## Evaluation and historical separation

The fixture harness reports structural citation validity and model-verifier
judgement separately. Mock mode makes no external calls. Live speech is
requested only for completed, grounded, non-refused runs, and fixture failures
do not stop later fixtures.

The locked Milestone 6 YarnGPT evidence and Milestone 7 ElevenLabs revision are
historical. They remain unchanged and are not evidence of the current
Gemini-to-9jaLingo path.

Deployment, hosting, production secrets, domains, and cloud resources remain a
repository-owner follow-up. No deployment is part of this provider revision.
