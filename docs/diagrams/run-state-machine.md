# Tutor Run Lifecycle — State Machine

<!--
Derived from:
  api/src/tutor/contracts/tutor-run-state.ts            (TutorRunStatus: created | running | completed | refused | failed)
  api/src/tutor/services/tutor-orchestrator.service.ts  (stage order, the four refuse() call sites, the catch -> failed path)
  api/src/tutor/policies/harness-policy.service.ts      (RunBudget ceilings; maxRevisions = 1)
  api/src/tutor/policies/harness-error.ts               (HarnessError codes and stages)
  api/src/database/migrations/2026072222000-CreateTutorHarness.ts (CHK_tutor_runs_status enforces the same five values)
-->

```mermaid
stateDiagram-v2
    direction TB

    state "refused — path 1: 'No curriculum evidence met the retrieval threshold.'" as refused_no_evidence
    state "refused — path 2: tutor limitation after the initial draft" as refused_draft_insufficient
    state "refused — path 3: tutor limitation after the bounded revision" as refused_revision_insufficient
    state "refused — path 4: 'could not be grounded...' (message names the revision when metrics.revisions > 0)" as refused_not_grounded

    [*] --> created : store.createRun()

    created --> running : updateRun(status='running')<br/>trace run.started

    state running {
        direction TB
        [*] --> query_transformation

        query_transformation : query-transformation<br/>ModelQueryTransformerAgent
        retrieval : retrieval<br/>DeterministicRetrievalAgent → curriculum.search
        evidence_gate : evidence decision<br/>accepted && hybridScore ≥ retrievalThreshold
        tutor : tutor<br/>ModelTutorAgent draft + enforceCitations
        verification : verification<br/>ModelGroundingVerifierAgent (attempt='initial')
        revision : revision<br/>ModelTutorAgent re-draft (RunBudget.addRevision)
        reverification : verification<br/>ModelGroundingVerifierAgent (attempt='revision')
        translation : translation<br/>TranslationProvider → outputLanguage

        query_transformation --> retrieval
        retrieval --> evidence_gate
        evidence_gate --> tutor : chunks remain
        tutor --> verification : insufficientEvidence = false
        verification --> translation : grounded = true
        verification --> revision : grounded = false<br/>&& revisionRecommended = true
        revision --> reverification : insufficientEvidence = false
        reverification --> translation : grounded = true
    }

    running --> completed : translation succeeded<br/>updateRun(finalAnswer, translatedAnswer,<br/>refused=false) · trace run.completed

    evidence_gate --> refused_no_evidence : chunks.length == 0
    tutor --> refused_draft_insufficient : insufficientEvidence = true
    revision --> refused_revision_insufficient : insufficientEvidence = true
    verification --> refused_not_grounded : grounded = false<br/>&& revisionRecommended = false
    reverification --> refused_not_grounded : still grounded = false<br/>(revision cap of 1 reached)

    running --> failed : HarnessError escapes any stage<br/>(AGENT_TIMEOUT, INVALID_AGENT_OUTPUT,<br/>UNKNOWN_CITATION, TOKEN_/COST_/AGENT_CALL_BUDGET_EXCEEDED,<br/>REVISION_LIMIT_EXCEEDED, TRANSLATION_*,<br/>CLIENT_DISCONNECTED)

    refused_no_evidence --> [*]
    refused_draft_insufficient --> [*]
    refused_revision_insufficient --> [*]
    refused_not_grounded --> [*]
    completed --> [*]
    failed --> [*]

    note right of failed
        status='failed' also sets refused=true and
        refusalReason=safeMessage, and appends a
        StructuredRunError; it is distinct from the
        four deliberate refusals above.
    end note
```

**Figure caption.** The run lifecycle as implemented in `TutorOrchestratorService.run()`. The persisted status
column takes only the five values enumerated by `TutorRunStatus` and enforced by the `CHK_tutor_runs_status`
constraint — `created`, `running`, `completed`, `refused`, `failed` — so the stage names shown inside the
`running` composite state are not persisted statuses; they are the `stage` field of the trace events and the
sequence points at which the orchestrator branches. Three decision points govern the flow. The evidence decision
applies after retrieval and keeps only chunks that are both `accepted` and at or above `retrievalThreshold`. The
grounding decision reads the verifier's `grounded` flag. The revision decision is bounded: `RunBudget.maxRevisions`
is fixed at 1 in code rather than being configurable, so at most one re-draft can occur, and the second
verification runs with `revisionAvailable = false`. Four distinct paths terminate in `refused`, corresponding to
the four `refuse()` call sites in the orchestrator: no evidence survives the retrieval threshold; the tutor agent
itself reports `insufficientEvidence` on the initial draft; the tutor reports `insufficientEvidence` again on the
revised draft; and the verifier still reports not-grounded, either immediately (when revision was not recommended)
or after the single permitted revision, in which case the refusal message explicitly names the exhausted revision.
Only the grounded path continues to translation and then to `completed`. A fifth terminal state, `failed`, is
reached when a `HarnessError` escapes any stage — timeouts, malformed structured output, a citation to unretrieved
evidence, an exceeded token/cost/agent-call budget, a translation-provider failure, or client disconnection. One
divergence worth noting for a thesis reader: `failed` also sets `refused = true` in the same row, so a query that
counts refusals by the boolean column will include failures; the two are separable only by the `status` value.
