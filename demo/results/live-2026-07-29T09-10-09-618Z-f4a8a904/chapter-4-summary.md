# Chapter 4 evaluation summary

> **LIVE MODE.** These results were produced against the locally configured live application.

- Evaluation run: `live-2026-07-29T09-10-09-618Z-f4a8a904`
- Timestamp: 2026-07-29T09:10:09.618Z
- Git commit: `9b375481c7113b1a9f6e97793598a6a33fca1902` (dirty: false)
- Fixture version: 1.0.0
- TTS: naijalingo v1, 9jalingo-tts-1, ada_pcm, wav
- Scope: system-level evaluation; no students; no learning-effectiveness claim

## Aggregate results

| Metric | Result |
|---|---:|
| Fixtures, including failures | 10 |
| Retrieval hit rate | 100.0% |
| Correct-refusal rate | 100.0% |
| Incorrect-refusal rate | 28.6% |
| Structural citation-integrity rate | 71.4% |
| Grounding-verifier completion rate | 71.4% |
| Revision rate | 20.0% |
| Median / p95 latency | 29764 ms / 139131 ms |
| Provider failures | 2 |
| TTS provider | naijalingo |
| TTS-eligible fixtures | 5 |
| External TTS calls made | 5 |
| TTS synthesis success rate | 60.0% |
| End-to-end expected voice success | 42.9% |
| Median TTS latency | 100822 ms |
| Known USD cost subtotal | $0.257812 |
| Complete median estimated cost | unavailable |
| Complete total estimated cost | unavailable |
| Median known USD subtotal | $0.026105 |

TTS cost uses the configured provider rate, currency, version, and effective date and is never an invoice. Provider `character-cost`, when present, is recorded separately as usage credits and is not treated as currency.

## Per-fixture results

| Fixture | Expected | Actual | Source hit | Structural citations | Verifier | Latency ms | TTS | Cost |
|---|---|---|---|---|---|---:|---|---|
| supported-sound-speed-01 | completed | completed | yes | pass | grounded | 31001 | failed | unavailable |
| supported-resistance-02 | completed | completed | yes | pass | grounded | 139131 | success | unavailable |
| supported-physical-change-03 | completed | completed | yes | pass | grounded | 84326 | success | unavailable |
| supported-si-units-04 | completed | refused | yes | n/a | not grounded | 29764 | not called | estimated |
| supported-cell-units-05 | completed | completed | yes | pass | grounded | 123207 | success | unavailable |
| supported-potential-energy-06 | completed | completed | yes | pass | grounded | 31796 | failed | unavailable |
| out-of-syllabus-president-07 | refused | refused | yes | n/a | not grounded | 6788 | not called | estimated |
| out-of-syllabus-cake-08 | refused | refused | yes | n/a | not grounded | 23220 | not called | estimated |
| misspelling-kinetic-formula-09 | completed | refused | yes | n/a | not grounded | 11831 | not called | estimated |
| boundary-kinetic-definition-10 | refused | refused | yes | n/a | not grounded | 24502 | not called | estimated |

## Interpretation boundaries

Structural citation checks, the model grounding-verifier judgement, and manual author evidence review are separate. The accompanying `manual-grounding-review.json` is intentionally unfilled. This is system-level evaluation, not a student study, and it provides no evidence of learning effectiveness or student voice preference.
