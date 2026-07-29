import { ConfigService } from '@nestjs/config';
import {
  CorpusSearchResult,
  CorpusSearchService,
} from '../../corpus/services/corpus-search.service';
import { CurriculumSearchTool } from './curriculum-search.tool';

describe('CurriculumSearchTool', () => {
  it('wraps CorpusSearchService and maps complete curriculum evidence', async () => {
    const result: CorpusSearchResult = {
      query: 'What is a physical change?',
      threshold: 0.65,
      count: 1,
      acceptedCount: 1,
      embedding: {
        model: 'test-embedding',
        dimensions: 1536,
        inputTokens: 25,
      },
      topCandidate: {
        chunkId: 'chunk-1',
        semanticSimilarity: 0.92,
        lexicalSimilarity: 1,
        hybridScore: 1,
        accepted: true,
      },
      results: [
        {
          chunkId: 'chunk-1',
          content: 'A physical change does not create a new substance.',
          pageStart: 8,
          pageEnd: 8,
          sourceLocator: 'page 8',
          topicId: 'topic-1',
          topicLabel: 'Physical changes',
          documentId: 'document-1',
          sourceTitle: 'Basic Science',
          sourceAuthor: 'Test Author',
          sourcePublisher: 'Test Publisher',
          sourceUrl: 'https://example.test/science',
          sourceLicence: 'Test fixture',
          subject: 'Basic Science',
          schoolLevel: 'SS1',
          curriculum: 'NERDC',
          similarity: 0.92,
          semanticSimilarity: 0.92,
          lexicalSimilarity: 1,
          hybridScore: 1,
          semanticRank: 1,
          lexicalRank: 1,
          matchedBy: ['semantic', 'lexical'],
          accepted: true,
        },
      ],
    };
    const search = jest.fn().mockResolvedValue(result);
    const corpusSearch = { search } as unknown as CorpusSearchService;
    const config = {
      get: jest.fn().mockReturnValue(0.02),
    } as unknown as ConfigService;
    const tool = new CurriculumSearchTool(corpusSearch, config);

    const output = await tool.execute({
      query: result.query,
      threshold: result.threshold,
      limit: 5,
    });

    expect(search).toHaveBeenCalledWith({
      query: result.query,
      threshold: result.threshold,
      limit: 5,
    });
    expect(output.output.chunks).toEqual([
      {
        chunkId: 'chunk-1',
        content: 'A physical change does not create a new substance.',
        topic: { id: 'topic-1', label: 'Physical changes' },
        locator: {
          pageStart: 8,
          pageEnd: 8,
          sourceLocator: 'page 8',
        },
        document: {
          id: 'document-1',
          sourceTitle: 'Basic Science',
          sourceAuthor: 'Test Author',
          sourcePublisher: 'Test Publisher',
          sourceUrl: 'https://example.test/science',
          sourceLicence: 'Test fixture',
          subject: 'Basic Science',
          schoolLevel: 'SS1',
          curriculum: 'NERDC',
        },
        similarity: 0.92,
        semanticSimilarity: 0.92,
        lexicalSimilarity: 1,
        hybridScore: 1,
        matchedBy: ['semantic', 'lexical'],
        accepted: true,
      },
    ]);
    expect(output.usage.tokens).toEqual({ input: 25, output: 0, total: 25 });
    expect(output.usage.estimatedCostUsd).toBeCloseTo(0.0000005);
    expect(output.summary).toEqual({
      candidateCount: 1,
      acceptedCount: 1,
      threshold: 0.65,
      topCandidate: result.topCandidate,
    });
  });
});
