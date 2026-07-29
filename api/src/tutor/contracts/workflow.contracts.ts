import {
  CurriculumChunk,
  GroundingResult,
  QueryTransformation,
  TutorCitation,
} from './tutor-run-state';

export interface RetrievalAgentInput {
  query: string;
  language: string;
}

export type QueryIntent =
  | 'learn_concept'
  | 'define_concept'
  | 'solve_problem'
  | 'compare_concepts'
  | 'explain_process'
  | 'other';

export interface QueryCorrection {
  original: string;
  corrected: string;
}

export interface QueryTransformerAgentInput {
  question: string;
  language: string;
}

export interface QueryTransformerAgentOutput {
  refinedQuery: string;
  intent: QueryIntent;
  concepts: string[];
  corrections: QueryCorrection[];
  model: string;
}

export interface RetrievalAgentOutput {
  chunks: CurriculumChunk[];
}

export interface TutorAgentInput {
  question: string;
  language: string;
  queryTransformation: QueryTransformation;
  chunks: CurriculumChunk[];
  revision?: {
    previousAnswer: string;
    verifierReasons: string[];
    verifierGuidance: string | null;
    unsupportedClaims: string[];
  };
}

export interface TutorAgentOutput {
  answer: string;
  citations: TutorCitation[];
  answerSummary: string;
  insufficientEvidence: boolean;
  limitation: string | null;
}

export interface GroundingVerifierInput {
  question: string;
  answer: string;
  citations: TutorCitation[];
  chunks: CurriculumChunk[];
  attempt: 'initial' | 'revision';
  revisionAvailable: boolean;
}

export type GroundingVerifierOutput = GroundingResult;

export interface CurriculumSearchInput {
  query: string;
  limit: number;
  threshold: number;
  subject?: string;
  schoolLevel?: string;
}

export interface CurriculumSearchOutput {
  chunks: CurriculumChunk[];
}
