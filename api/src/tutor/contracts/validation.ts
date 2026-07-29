import { AgentResult } from './agent.contract';
import { ToolResult } from './tool.contract';
import { CurriculumChunk, TutorCitation } from './tutor-run-state';
import {
  GroundingVerifierOutput,
  QueryTransformerAgentOutput,
  RetrievalAgentOutput,
  TutorAgentOutput,
} from './workflow.contracts';
import { TUTOR_ANSWER_MAX_CHARACTERS } from './tutor-limits';

const queryIntents = new Set([
  'learn_concept',
  'define_concept',
  'solve_problem',
  'compare_concepts',
  'explain_process',
  'other',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasValidUsage(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.tokens)) return false;
  return (
    isFiniteNonNegative(value.tokens.input) &&
    isFiniteNonNegative(value.tokens.output) &&
    isFiniteNonNegative(value.tokens.total) &&
    value.tokens.total === value.tokens.input + value.tokens.output &&
    isFiniteNonNegative(value.estimatedCostUsd)
  );
}

export function isAgentResult<T>(
  value: unknown,
  outputValidator: (output: unknown) => output is T,
): value is AgentResult<T> {
  return (
    isRecord(value) &&
    outputValidator(value.output) &&
    hasValidUsage(value.usage) &&
    isRecord(value.summary)
  );
}

export function isToolResult<T>(
  value: unknown,
  outputValidator: (output: unknown) => output is T,
): value is ToolResult<T> {
  return (
    isRecord(value) &&
    outputValidator(value.output) &&
    hasValidUsage(value.usage) &&
    isRecord(value.summary)
  );
}

export function isCurriculumChunk(value: unknown): value is CurriculumChunk {
  if (!isRecord(value) || !isRecord(value.topic)) return false;
  if (!isRecord(value.locator) || !isRecord(value.document)) return false;
  return (
    typeof value.chunkId === 'string' &&
    value.chunkId.length > 0 &&
    typeof value.content === 'string' &&
    value.content.length > 0 &&
    (value.topic.id === null || typeof value.topic.id === 'string') &&
    (value.topic.label === null || typeof value.topic.label === 'string') &&
    Number.isInteger(value.locator.pageStart) &&
    Number.isInteger(value.locator.pageEnd) &&
    typeof value.locator.sourceLocator === 'string' &&
    typeof value.document.id === 'string' &&
    typeof value.document.sourceTitle === 'string' &&
    (value.document.sourceAuthor === null ||
      typeof value.document.sourceAuthor === 'string') &&
    (value.document.sourcePublisher === null ||
      typeof value.document.sourcePublisher === 'string') &&
    (value.document.sourceUrl === null ||
      typeof value.document.sourceUrl === 'string') &&
    typeof value.document.sourceLicence === 'string' &&
    typeof value.document.subject === 'string' &&
    typeof value.document.schoolLevel === 'string' &&
    typeof value.document.curriculum === 'string' &&
    isFiniteNonNegative(value.similarity) &&
    value.similarity <= 1 &&
    isFiniteNonNegative(value.semanticSimilarity) &&
    value.semanticSimilarity <= 1 &&
    isFiniteNonNegative(value.lexicalSimilarity) &&
    value.lexicalSimilarity <= 1 &&
    isFiniteNonNegative(value.hybridScore) &&
    value.hybridScore <= 1 &&
    Array.isArray(value.matchedBy) &&
    value.matchedBy.every(
      (method) => method === 'semantic' || method === 'lexical',
    ) &&
    typeof value.accepted === 'boolean'
  );
}

export function isTutorCitation(value: unknown): value is TutorCitation {
  return (
    isRecord(value) &&
    typeof value.chunkId === 'string' &&
    value.chunkId.length > 0 &&
    typeof value.sourceTitle === 'string' &&
    typeof value.sourceLocator === 'string'
  );
}

export function isRetrievalOutput(
  value: unknown,
): value is RetrievalAgentOutput {
  return (
    isRecord(value) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isCurriculumChunk)
  );
}

export function isQueryTransformerOutput(
  value: unknown,
): value is QueryTransformerAgentOutput {
  return (
    isRecord(value) &&
    typeof value.refinedQuery === 'string' &&
    value.refinedQuery.trim().length >= 2 &&
    value.refinedQuery.length <= 500 &&
    typeof value.intent === 'string' &&
    queryIntents.has(value.intent) &&
    Array.isArray(value.concepts) &&
    value.concepts.length <= 8 &&
    value.concepts.every(
      (concept) =>
        typeof concept === 'string' &&
        concept.trim().length > 0 &&
        concept.length <= 100,
    ) &&
    Array.isArray(value.corrections) &&
    value.corrections.length <= 8 &&
    value.corrections.every(
      (correction) =>
        isRecord(correction) &&
        typeof correction.original === 'string' &&
        correction.original.length > 0 &&
        correction.original.length <= 100 &&
        typeof correction.corrected === 'string' &&
        correction.corrected.length > 0 &&
        correction.corrected.length <= 100,
    ) &&
    typeof value.model === 'string' &&
    value.model.length > 0
  );
}

export function isTutorOutput(value: unknown): value is TutorAgentOutput {
  if (!isRecord(value)) return false;
  const limitationIsValid =
    value.limitation === null ||
    (typeof value.limitation === 'string' &&
      value.limitation.trim().length > 0 &&
      value.limitation.length <= 1_000);
  return (
    typeof value.answer === 'string' &&
    value.answer.trim().length > 0 &&
    value.answer.length <= TUTOR_ANSWER_MAX_CHARACTERS &&
    typeof value.answerSummary === 'string' &&
    value.answerSummary.trim().length > 0 &&
    value.answerSummary.length <= 500 &&
    typeof value.insufficientEvidence === 'boolean' &&
    limitationIsValid &&
    (!value.insufficientEvidence || typeof value.limitation === 'string') &&
    Array.isArray(value.citations) &&
    (value.insufficientEvidence || value.citations.length > 0) &&
    value.citations.every(isTutorCitation)
  );
}

export function isGroundingOutput(
  value: unknown,
): value is GroundingVerifierOutput {
  if (!isRecord(value)) return false;
  const reasons = Array.isArray(value.reasons) ? value.reasons : null;
  const reasonsAreValid =
    reasons !== null &&
    reasons.length <= 10 &&
    reasons.every(
      (reason) =>
        typeof reason === 'string' &&
        reason.trim().length > 0 &&
        reason.length <= 1_000,
    );
  const guidanceIsValid =
    value.revisionGuidance === null ||
    (typeof value.revisionGuidance === 'string' &&
      value.revisionGuidance.trim().length > 0 &&
      value.revisionGuidance.length <= 2_000);
  const unsupportedClaims = Array.isArray(value.unsupportedClaims)
    ? value.unsupportedClaims
    : null;
  const unsupportedClaimsAreValid =
    unsupportedClaims !== null &&
    unsupportedClaims.length <= 10 &&
    unsupportedClaims.every(
      (claim) =>
        typeof claim === 'string' &&
        claim.trim().length > 0 &&
        claim.length <= 1_000,
    );
  if (!reasonsAreValid || !unsupportedClaimsAreValid) return false;
  return (
    typeof value.grounded === 'boolean' &&
    Array.isArray(value.checkedCitationIds) &&
    value.checkedCitationIds.every((id) => typeof id === 'string') &&
    typeof value.revisionRecommended === 'boolean' &&
    guidanceIsValid &&
    (!value.grounded ||
      (value.revisionRecommended === false &&
        value.revisionGuidance === null &&
        unsupportedClaims.length === 0)) &&
    (value.grounded || reasons.length > 0) &&
    (!value.revisionRecommended || typeof value.revisionGuidance === 'string')
  );
}
