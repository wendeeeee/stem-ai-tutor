In the repository, execute the locked ten-fixture live evaluation using 9jaLingo as the TTS provider. This is a real, paid, single-shot run — accuracy and non-duplication matter more than speed. Follow these steps in order and STOP if any precheck fails.

PRECHECKS (do not skip):
1. Confirm the working tree is clean and record the current commit SHA (git rev-parse HEAD). The manifest must capture this exact commit.
2. Confirm all required live credentials are present in the environment WITHOUT printing their values: the ASR key, the tutor/verifier model key, the embeddings key, the translation key, and NAIJALINGO_API_KEY. Report only present/absent for each. If any required key is absent, STOP and tell me.
3. Confirm Postgres and Redis are up and the corpus is ingested (the corpus tables are non-empty and the expected two Basic Science documents are present). If the corpus is empty, STOP.

MOCK VERIFICATION (free — must pass before spending anything):
4. Run the demo in mock mode with 9jaLingo selected:
   TTS_PROVIDER=naijalingo node demo/scripts/run-demo.mjs --mode mock
5. Confirm: the run completes all ten fixtures, writes a results directory, and the manifest's providers.tts block shows provider="naijalingo" with the correct model, voice, and format. Report that tts block back. Do NOT proceed to live if the label or config is wrong.

LIVE RUN (single pass, no automatic retries):
6. Run the live evaluation with 9jaLingo:
   TTS_PROVIDER=naijalingo node demo/scripts/run-demo.mjs --mode live
   Expect this to take 10–20+ minutes because 9jaLingo synthesis is slow (~180s per completing fixture). Let it run to completion; do not interrupt and re-run on a transient slow response. If a single fixture errors, let the harness record the error and continue — do NOT restart the whole run to "fix" one fixture (that double-charges the other nine). If the run dies entirely, stop and report the error before any re-run.

AFTER THE RUN — report back, do not edit anything:
7. The path of the new results directory.
8. The manifest in full: commit SHA, all model pins, retrieval threshold and top-k, the tts provider block, fixture-set version, and mode=live.
9. The per-fixture results table (all ten rows: fixture id, expected disposition, actual disposition, retrieval source hit/miss, refusal correctness, citation integrity, latency, tts status, cost state).
10. The aggregates: disposition accuracy, retrieval hit rate, correct-refusal rate, grounded-completion rate, revision rate, citation-integrity rate, latency median and p95, tts success count, and the cost subtotal WITH the honest unavailable-cost note (do not invent a rate or currency conversion).


Do not modify run-demo.mjs, fixtures, or any source during this task. This is an execution-and-report task only. The output of step 6 is the single source of truth for Chapter 4; nothing about it may be hand-edited afterward.