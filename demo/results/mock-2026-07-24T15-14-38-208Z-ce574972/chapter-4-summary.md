# Chapter 4 evaluation summary

> **MOCK MODE.** These deterministic results validate fixtures, scoring, and exports. They are not live model or provider performance evidence.

- Evaluation run: `mock-2026-07-24T15-14-38-208Z-ce574972`
- Timestamp: 2026-07-24T15:14:38.208Z
- Git commit: `uncommitted-no-head` (dirty: true)
- Fixture version: 1.0.0
- TTS: YarnGPT API v1, Chinenye, mp3
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
| YarnGPT synthesis success rate | 100.0% |
| Median YarnGPT latency | 713 ms |
| Known USD cost subtotal | $0.096800 |
| Complete median estimated cost | unavailable |
| Complete total estimated cost | unavailable |
| Median known USD subtotal | $0.012400 |

YarnGPT cost is marked unavailable when no defensible configured rate exists. It is never treated as zero, and no NGN/USD conversion is invented.

## Per-fixture results

| Fixture | Expected | Actual | Source hit | Structural citations | Verifier | Latency ms | YarnGPT | Cost |
|---|---|---|---|---|---|---:|---|---|
| supported-sound-speed-01 | completed | completed | yes | pass | grounded | 2420 | success | unavailable |
| supported-resistance-02 | completed | completed | yes | pass | grounded | 2588 | success | unavailable |
| supported-physical-change-03 | completed | completed | yes | pass | grounded | 2756 | success | unavailable |
| supported-si-units-04 | completed | completed | yes | pass | grounded | 2924 | success | unavailable |
| supported-cell-units-05 | completed | completed | yes | pass | grounded | 3092 | success | unavailable |
| supported-potential-energy-06 | completed | completed | yes | pass | grounded | 3260 | success | unavailable |
| out-of-syllabus-president-07 | refused | refused | yes | n/a | not grounded | 2622 | not called | estimated |
| out-of-syllabus-cake-08 | refused | refused | yes | n/a | not grounded | 2759 | not called | estimated |
| misspelling-kinetic-formula-09 | completed | completed | yes | pass | grounded | 3764 | success | unavailable |
| boundary-kinetic-definition-10 | refused | refused | yes | n/a | not grounded | 3033 | not called | estimated |

## Interpretation boundaries

Structural citation checks, the model grounding-verifier judgement, and manual author evidence review are separate. The accompanying `manual-grounding-review.json` is intentionally unfilled. This is system-level evaluation, not a student study, and it provides no evidence of learning effectiveness or student voice preference.
