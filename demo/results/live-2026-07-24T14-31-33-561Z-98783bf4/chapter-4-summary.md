# Chapter 4 evaluation summary

> **LIVE MODE.** These results were produced against the locally configured live application.

- Evaluation run: `live-2026-07-24T14-31-33-561Z-98783bf4`
- Timestamp: 2026-07-24T14:31:33.561Z
- Git commit: `uncommitted-no-head` (dirty: true)
- Fixture version: 1.0.0
- TTS: YarnGPT API v1, Chinenye, mp3
- Scope: system-level evaluation; no students; no learning-effectiveness claim

## Aggregate results

| Metric | Result |
|---|---:|
| Fixtures, including failures | 10 |
| Retrieval hit rate | 100.0% |
| Correct-refusal rate | 66.7% |
| Incorrect-refusal rate | 28.6% |
| Structural citation-integrity rate | 71.4% |
| Grounding-verifier completion rate | 71.4% |
| Revision rate | 20.0% |
| Median / p95 latency | 28732 ms / 42076 ms |
| Provider failures | 0 |
| YarnGPT calls made | 6 |
| YarnGPT synthesis success rate | 100.0% |
| End-to-end expected voice success | 71.4% |
| Median YarnGPT latency | 23220 ms |
| Known USD cost subtotal | $0.230647 |
| Complete median estimated cost | unavailable |
| Complete total estimated cost | unavailable |
| Median known USD subtotal | $0.021955 |

YarnGPT cost is marked unavailable when no defensible configured rate exists. It is never treated as zero, and no NGN/USD conversion is invented.

## Per-fixture results

| Fixture | Expected | Actual | Source hit | Structural citations | Verifier | Latency ms | YarnGPT | Cost |
|---|---|---|---|---|---|---:|---|---|
| supported-sound-speed-01 | completed | completed | yes | pass | grounded | 42076 | success | unavailable |
| supported-resistance-02 | completed | completed | yes | pass | grounded | 36281 | success | unavailable |
| supported-physical-change-03 | completed | completed | yes | pass | grounded | 28732 | success | unavailable |
| supported-si-units-04 | completed | refused | yes | n/a | not grounded | 18999 | not called | estimated |
| supported-cell-units-05 | completed | completed | yes | pass | grounded | 40180 | success | unavailable |
| supported-potential-energy-06 | completed | completed | yes | pass | grounded | 34604 | success | unavailable |
| out-of-syllabus-president-07 | refused | refused | yes | n/a | not grounded | 3906 | not called | estimated |
| out-of-syllabus-cake-08 | refused | refused | yes | n/a | not grounded | 5917 | not called | estimated |
| misspelling-kinetic-formula-09 | completed | refused | yes | n/a | not grounded | 8528 | not called | estimated |
| boundary-kinetic-definition-10 | refused | completed | yes | pass | grounded | 30863 | success | unavailable |

## Interpretation boundaries

Structural citation checks, the model grounding-verifier judgement, and manual author evidence review are separate. The accompanying `manual-grounding-review.json` is intentionally unfilled. This is system-level evaluation, not a student study, and it provides no evidence of learning effectiveness or student voice preference.
