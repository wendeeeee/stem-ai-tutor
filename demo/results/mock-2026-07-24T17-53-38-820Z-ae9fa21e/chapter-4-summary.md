# Chapter 4 evaluation summary

> **MOCK MODE.** These deterministic results validate fixtures, scoring, and exports. They are not live model or provider performance evidence.

- Evaluation run: `mock-2026-07-24T17-53-38-820Z-ae9fa21e`
- Timestamp: 2026-07-24T17:53:38.820Z
- Git commit: `uncommitted-no-head` (dirty: true)
- Fixture version: 1.0.0
- TTS: elevenlabs v1, eleven_flash_v2_5, Unselected ElevenLabs voice, mp3_44100_128
- Scope: system-level evaluation; no students; no learning-effectiveness claim

## Aggregate results

| Metric | Result |
|---|---:|
| Fixtures, including failures | 10 |
| Retrieval hit rate | 100.0% |
| Correct-refusal rate | 100.0% |
| Incorrect-refusal rate | 0.0% |
| Structural citation-integrity rate | 100.0% |
| Grounding-verifier completion rate | 100.0% |
| Revision rate | 10.0% |
| Median / p95 latency | 2759 ms / 3764 ms |
| Provider failures | 0 |
| TTS provider | elevenlabs |
| TTS-eligible fixtures | 7 |
| External TTS calls made | 0 |
| TTS synthesis success rate | 100.0% |
| End-to-end expected voice success | 100.0% |
| Median TTS latency | 713 ms |
| Known USD cost subtotal | $0.454350 |
| Complete median estimated cost | $0.059250 |
| Complete total estimated cost | $0.454350 |
| Median known USD subtotal | $0.059250 |

TTS cost uses the configured public list-rate estimate and is never an invoice. ElevenLabs `character-cost`, when present, is recorded separately as provider usage credits and is not treated as currency.

## Per-fixture results

| Fixture | Expected | Actual | Source hit | Structural citations | Verifier | Latency ms | TTS | Cost |
|---|---|---|---|---|---|---:|---|---|
| supported-sound-speed-01 | completed | completed | yes | pass | grounded | 2420 | success | estimated |
| supported-resistance-02 | completed | completed | yes | pass | grounded | 2588 | success | estimated |
| supported-physical-change-03 | completed | completed | yes | pass | grounded | 2756 | success | estimated |
| supported-si-units-04 | completed | completed | yes | pass | grounded | 2924 | success | estimated |
| supported-cell-units-05 | completed | completed | yes | pass | grounded | 3092 | success | estimated |
| supported-potential-energy-06 | completed | completed | yes | pass | grounded | 3260 | success | estimated |
| out-of-syllabus-president-07 | refused | refused | yes | n/a | not grounded | 2622 | not called | estimated |
| out-of-syllabus-cake-08 | refused | refused | yes | n/a | not grounded | 2759 | not called | estimated |
| misspelling-kinetic-formula-09 | completed | completed | yes | pass | grounded | 3764 | success | estimated |
| boundary-kinetic-definition-10 | refused | refused | yes | n/a | not grounded | 3033 | not called | estimated |

## Interpretation boundaries

Structural citation checks, the model grounding-verifier judgement, and manual author evidence review are separate. The accompanying `manual-grounding-review.json` is intentionally unfilled. This is system-level evaluation, not a student study, and it provides no evidence of learning effectiveness or student voice preference.
