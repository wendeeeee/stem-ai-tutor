import { AgentContext } from '../contracts/agent.contract';
import {
  CurriculumChunk,
  QueryTransformation,
} from '../contracts/tutor-run-state';
import { ModelTutorAgent } from './model-tutor.agent';

const chunk = {
  chunkId: 'chunk-1',
  content: 'A physical change does not form a new substance.',
  topic: { id: null, label: 'Physical changes' },
  locator: { pageStart: 2, pageEnd: 2, sourceLocator: 'page 2' },
  document: {
    id: 'document-1',
    sourceTitle: 'Basic Science Text',
    sourceAuthor: null,
    sourcePublisher: null,
    sourceUrl: null,
    sourceLicence: 'CC BY 4.0',
    subject: 'Basic Science',
    schoolLevel: 'SS1',
    curriculum: 'NERDC',
  },
  similarity: 0.9,
  semanticSimilarity: 0.9,
  lexicalSimilarity: 0.8,
  hybridScore: 0.9,
  matchedBy: ['semantic'],
  accepted: true,
} satisfies CurriculumChunk;

const transformation: QueryTransformation = {
  originalQuery: 'What is a physical change?',
  refinedQuery: 'physical change definition',
  intent: 'define_concept',
  concepts: ['physical change'],
  corrections: [],
  model: 'query-model',
};

describe('ModelTutorAgent', () => {
  it('maps provider output, canonicalizable citations, deadline, and usage', async () => {
    const generate = jest.fn().mockResolvedValue({
      answer: 'A physical change does not form a new substance.',
      citedChunkIds: ['chunk-1'],
      answerSummary: 'Defines physical change.',
      insufficientEvidence: false,
      limitation: null,
      model: 'tutor-model',
      inputTokens: 30,
      outputTokens: 10,
      estimatedCostUsd: 0.0002,
    });
    const agent = new ModelTutorAgent({ generate });
    const controller = new AbortController();
    const deadlineAt = new Date(Date.now() + 1_000);
    const context = {
      runId: 'run-1',
      attempt: 0,
      deadlineAt,
      signal: controller.signal,
      tools: {},
    } as AgentContext;

    const result = await agent.execute(
      {
        question: transformation.originalQuery,
        language: 'en',
        queryTransformation: transformation,
        chunks: [chunk],
      },
      context,
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        deadlineAt,
        queryTransformation: transformation,
      }),
      controller.signal,
    );
    expect(result.output.citations).toEqual([
      {
        chunkId: chunk.chunkId,
        sourceTitle: chunk.document.sourceTitle,
        sourceLocator: chunk.locator.sourceLocator,
      },
    ]);
    expect(result.usage.tokens).toEqual({ input: 30, output: 10, total: 40 });
    expect(result.summary).toMatchObject({
      model: 'tutor-model',
      answerSummary: 'Defines physical change.',
    });
  });
});
