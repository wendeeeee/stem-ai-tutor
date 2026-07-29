import { DataSource } from 'typeorm';
import { EmbeddingProvider } from '../embeddings/embedding-provider';
import { CorpusSearchService } from './corpus-search.service';

describe('CorpusSearchService', () => {
  it('returns top-k hybrid candidates before threshold filtering', async () => {
    const rows = [
      {
        chunkId: 'chunk-kinetic',
        content: 'Kinetic energy is the energy of a moving object.',
        pageStart: 465,
        pageEnd: 465,
        sourceLocator: 'page 465',
        topicId: null,
        topicLabel: 'Mechanical energy',
        documentId: 'document-1',
        sourceTitle: 'Physics',
        sourceAuthor: null,
        sourcePublisher: null,
        sourceUrl: null,
        sourceLicence: 'Test fixture',
        subject: 'Physics',
        schoolLevel: 'SS1',
        curriculum: 'NERDC',
        semanticSimilarity: '0.54',
        lexicalSimilarity: '0.61',
        hybridScore: '0.61',
        semanticRank: '1',
        lexicalRank: '1',
      },
    ];
    let capturedParameters: unknown[] = [];
    const query = jest.fn((_sql: string, parameters: unknown[]) => {
      capturedParameters = parameters;
      return Promise.resolve(rows);
    });
    const dataSource = { query } as unknown as DataSource;
    const embeddingProvider: EmbeddingProvider = {
      embed: jest.fn().mockResolvedValue({
        embeddings: [[1, 0]],
        model: 'test-embedding',
        dimensions: 2,
        inputTokens: 4,
      }),
    };
    const service = new CorpusSearchService(dataSource, embeddingProvider);

    const result = await service.search({
      query: 'what is kinectic energy?',
      limit: 5,
      threshold: 0.65,
    });

    expect(result).toMatchObject({
      count: 1,
      acceptedCount: 0,
      topCandidate: {
        chunkId: 'chunk-kinetic',
        semanticSimilarity: 0.54,
        lexicalSimilarity: 0.61,
        hybridScore: 0.61,
        accepted: false,
      },
      results: [
        {
          chunkId: 'chunk-kinetic',
          similarity: 0.54,
          semanticSimilarity: 0.54,
          lexicalSimilarity: 0.61,
          hybridScore: 0.61,
          matchedBy: ['semantic', 'lexical'],
          accepted: false,
        },
      ],
    });
    expect(capturedParameters).toEqual([
      JSON.stringify([1, 0]),
      'what is kinectic energy?',
      50,
      0.2,
      5,
    ]);
    expect(capturedParameters).not.toContain(0.65);
  });
});
