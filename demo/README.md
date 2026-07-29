# Reproducible evaluation

The evaluation uses ten English fixtures locked in
[`fixtures/stem-evaluation-v1.json`](fixtures/stem-evaluation-v1.json): six
supported questions, two out-of-syllabus questions, one
misspelling/conversational query, and one related insufficient-evidence
boundary. Expectations were defined from the approved local corpus before
evaluation and must not be edited to make a later run pass.

## Current provider revision

The harness defaults to the same `naijalingo` provider as the API. It records
the configured 9jaLingo model, Nigerian Pidgin (`pcm`) voice, WAV format, input
limit, and pricing metadata. `elevenlabs`, `yarngpt`, and `openai` remain
explicit operator choices. Mock mode is the safe default:

```bash
npm run demo -- --mode mock
```

Mock mode validates fixtures, scoring, denominators, JSON/CSV/Markdown exports,
and the manifest without making OpenAI, 9jaLingo, ElevenLabs, or YarnGPT calls.
CI uses this mode with empty provider credentials.

The historical deterministic ElevenLabs provider-revision evidence created on
24 July 2026 is
[`mock-2026-07-24T17-53-38-820Z-ae9fa21e`](results/mock-2026-07-24T17-53-38-820Z-ae9fa21e/).
Its manifest records `externalCallsMade=false`, an empty voice ID, the exact
model/format, the 8,000-character effective limit, and the configured list-rate
estimate. It is harness evidence, not live ElevenLabs performance.

Every run creates a unique directory under `results/`; no existing result is
overwritten. Each directory contains:

- `manifest.json`: run/time, commit and dirty state, corpus/configuration, exact
  TTS provider, API version, model, voice ID/display name, format, limit, and
  dated pricing assumptions;
- `results.json`: machine-readable fixture and aggregate results;
- `results.csv`: flat results including model, voice, format, character usage,
  latency, provider `character-cost`, and estimated cost;
- `chapter-4-summary.md`: aggregate and per-fixture summary;
- `manual-grounding-review.json`: a separate, intentionally unfilled human
  evidence-review rubric.

Live mode requires the complete local application, populated corpus, explicit
confirmation, and valid server-side credentials:

```bash
npm run db:up
npm run migration:run
TUTOR_RETRIEVAL_THRESHOLD=0.65 TTS_PROVIDER=naijalingo \
  npm run start:prod --workspace api

DEMO_LIVE_CONFIRM=YES \
DEMO_API_ORIGIN=http://localhost:3000 \
TTS_PROVIDER=naijalingo \
npm run demo -- --mode live
```

For 9jaLingo, live-mode validation requires `NAIJALINGO_API_KEY`; the tutor
pipeline also requires its configured OpenAI credential. The harness explicitly
requests Nigerian Pidgin output with `preferredLanguage: "pcm"`, uses bounded
HTTP attempts for transient 429/5xx/network failures, continues after each
fixture/TTS failure, and never prints raw provider bodies. It requests speech
only for a completed, grounded, non-refused run. Failed and refused runs never
call TTS. Audio bytes are counted and discarded.

## Current cost handling

No 9jaLingo monetary rate is assumed by default. A run reports TTS cost as
unavailable unless `NAIJALINGO_COST_PER_1000_CHARACTERS` is configured together
with the corresponding currency, version, and effective-date metadata. Any
provider `character-cost` response header is recorded separately as provider
usage and is never converted into currency.

Changing a rate requires changing its currency, version, and effective date
together. Historical exports are never recalculated.

## Historical Milestone 6 YarnGPT result

The locked 24 July 2026 live run is
[`live-2026-07-24T14-31-33-561Z-98783bf4`](results/live-2026-07-24T14-31-33-561Z-98783bf4/).
It predates the ElevenLabs revision and remains YarnGPT evidence:

| Metric                             |  Historical result |
| ---------------------------------- | -----------------: |
| Fixtures                           |                 10 |
| Disposition accuracy               |              70.0% |
| Expected-source retrieval hit rate |             100.0% |
| Correct-refusal rate               |              66.7% |
| Incorrect-refusal rate             |              28.6% |
| Structural citation-integrity rate |              71.4% |
| Grounded expected-completion rate  |              71.4% |
| Revision rate                      |              20.0% |
| Median / p95 end-to-end latency    | 28,732 / 42,076 ms |
| YarnGPT calls                      |                  6 |
| YarnGPT call success               |                6/6 |
| Median successful YarnGPT latency  |          23,220 ms |
| Provider failures                  |                  0 |
| Known USD subtotal                 |        $0.23064668 |
| Complete median/total cost         |        unavailable |

The system incorrectly refused the SI-units and misspelled kinetic-formula
fixtures and completed the locked kinetic-definition boundary. Those findings,
YarnGPT screenshots, recordings, model fields, cost state, and aggregate names
remain unchanged. They must never be cited as ElevenLabs performance.

## Manual review and scope

For every completed live answer, the author must independently review material
claim support, whether the original question was answered, citation relevance,
absence of unsupported external facts, language suitability, and analogy
labelling. The model verifier is not a human reviewer; `null` is not a pass.

Voice selection uses an author/developer listening assessment, not a student
study and not evidence of student preference. This is system-level evaluation:
no students participated and no learning-effectiveness claim is supported.
