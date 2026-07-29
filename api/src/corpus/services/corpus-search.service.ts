import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EMBEDDING_PROVIDER } from '../corpus.constants';
import { SearchCorpusDto } from '../dto/search-corpus.dto';
import { EmbeddingProvider } from '../embeddings/embedding-provider';

interface SearchRow {
  chunkId: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  sourceLocator: string;
  topicId: string | null;
  topicLabel: string | null;
  documentId: string;
  sourceTitle: string;
  sourceAuthor: string | null;
  sourcePublisher: string | null;
  sourceUrl: string | null;
  sourceLicence: string;
  subject: string;
  schoolLevel: string;
  curriculum: string;
  semanticSimilarity: string | number;
  lexicalSimilarity: string | number;
  hybridScore: string | number;
  semanticRank: string | number | null;
  lexicalRank: string | number | null;
}

export interface CorpusSearchCandidate {
  chunkId: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  sourceLocator: string;
  topicId: string | null;
  topicLabel: string | null;
  documentId: string;
  sourceTitle: string;
  sourceAuthor: string | null;
  sourcePublisher: string | null;
  sourceUrl: string | null;
  sourceLicence: string;
  subject: string;
  schoolLevel: string;
  curriculum: string;
  similarity: number;
  semanticSimilarity: number;
  lexicalSimilarity: number;
  hybridScore: number;
  semanticRank: number | null;
  lexicalRank: number | null;
  matchedBy: Array<'semantic' | 'lexical'>;
  accepted: boolean;
}

export interface CorpusSearchResult {
  query: string;
  threshold: number;
  count: number;
  acceptedCount: number;
  embedding: {
    model: string;
    dimensions: number;
    inputTokens: number;
  };
  topCandidate: {
    chunkId: string;
    semanticSimilarity: number;
    lexicalSimilarity: number;
    hybridScore: number;
    accepted: boolean;
  } | null;
  results: CorpusSearchCandidate[];
}

@Injectable()
export class CorpusSearchService {
  private static readonly LEXICAL_CANDIDATE_THRESHOLD = 0.2;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async search(input: SearchCorpusDto): Promise<CorpusSearchResult> {
    const embedded = await this.embeddingProvider.embed([input.query]);
    const vector = embedded.embeddings[0];

    if (!vector) {
      throw new Error('The embedding provider returned no query vector.');
    }

    const parameters: unknown[] = [JSON.stringify(vector), input.query];
    const filters = ["document.status = 'ready'"];

    if (input.subject) {
      parameters.push(input.subject);
      filters.push(`document.subject = $${parameters.length}`);
    }

    if (input.schoolLevel) {
      parameters.push(input.schoolLevel);
      filters.push(`document.school_level = $${parameters.length}`);
    }

    const candidateLimit = Math.min(200, Math.max(50, input.limit * 10));
    parameters.push(candidateLimit);
    const candidateLimitParameter = parameters.length;
    parameters.push(CorpusSearchService.LEXICAL_CANDIDATE_THRESHOLD);
    const lexicalThresholdParameter = parameters.length;
    parameters.push(input.limit);
    const limitParameter = parameters.length;
    const eligibility = filters.join(' AND ');
    const lexicalScore = this.lexicalScoreSql('$2');

    const rows = await this.dataSource.query<SearchRow[]>(
      `
        WITH semantic_candidates AS (
          SELECT
            chunk.id,
            ROW_NUMBER() OVER (
              ORDER BY chunk.embedding <=> $1::vector
            ) AS rank
          FROM corpus_chunks chunk
          INNER JOIN corpus_documents document
            ON document.id = chunk.document_id
          WHERE ${eligibility}
          ORDER BY chunk.embedding <=> $1::vector
          LIMIT $${candidateLimitParameter}
        ),
        lexical_candidates AS (
          SELECT
            chunk.id,
            lexical.score,
            ROW_NUMBER() OVER (
              ORDER BY lexical.score DESC, chunk.id
            ) AS rank
          FROM corpus_chunks chunk
          INNER JOIN corpus_documents document
            ON document.id = chunk.document_id
          CROSS JOIN LATERAL (
            SELECT ${lexicalScore} AS score
          ) lexical
          WHERE ${eligibility}
            AND lexical.score >= $${lexicalThresholdParameter}
          ORDER BY lexical.score DESC, chunk.id
          LIMIT $${candidateLimitParameter}
        ),
        candidate_ids AS (
          SELECT id FROM semantic_candidates
          UNION
          SELECT id FROM lexical_candidates
        ),
        scored_candidates AS (
          SELECT
            chunk.id AS "chunkId",
            chunk.content,
            chunk.page_start AS "pageStart",
            chunk.page_end AS "pageEnd",
            chunk.source_locator AS "sourceLocator",
            topic.id AS "topicId",
            topic.label AS "topicLabel",
            document.id AS "documentId",
            source.title AS "sourceTitle",
            source.author AS "sourceAuthor",
            source.publisher AS "sourcePublisher",
            source.source_url AS "sourceUrl",
            source.licence AS "sourceLicence",
            document.subject,
            document.school_level AS "schoolLevel",
            document.curriculum,
            GREATEST(
              0.0,
              1 - (chunk.embedding <=> $1::vector)
            ) AS "semanticSimilarity",
            lexical.score AS "lexicalSimilarity",
            semantic.rank AS "semanticRank",
            lexical_candidate.rank AS "lexicalRank"
          FROM candidate_ids candidate
          INNER JOIN corpus_chunks chunk ON chunk.id = candidate.id
          INNER JOIN corpus_documents document
            ON document.id = chunk.document_id
          INNER JOIN corpus_sources source ON source.id = document.source_id
          LEFT JOIN curriculum_topics topic ON topic.id = chunk.topic_id
          LEFT JOIN semantic_candidates semantic ON semantic.id = chunk.id
          LEFT JOIN lexical_candidates lexical_candidate
            ON lexical_candidate.id = chunk.id
          CROSS JOIN LATERAL (
            SELECT ${lexicalScore} AS score
          ) lexical
        )
        SELECT
          scored.*,
          GREATEST(
            scored."semanticSimilarity",
            scored."lexicalSimilarity"
          ) AS "hybridScore"
        FROM scored_candidates scored
        ORDER BY
          "hybridScore" DESC,
          scored."semanticSimilarity" DESC,
          scored."chunkId"
        LIMIT $${limitParameter}
      `,
      parameters,
    );

    const results = rows.map((row) => this.mapCandidate(row, input.threshold));
    const top = results[0];

    return {
      query: input.query,
      threshold: input.threshold,
      count: results.length,
      acceptedCount: results.filter((result) => result.accepted).length,
      embedding: {
        model: embedded.model,
        dimensions: embedded.dimensions,
        inputTokens: embedded.inputTokens,
      },
      topCandidate: top
        ? {
            chunkId: top.chunkId,
            semanticSimilarity: top.semanticSimilarity,
            lexicalSimilarity: top.lexicalSimilarity,
            hybridScore: top.hybridScore,
            accepted: top.accepted,
          }
        : null,
      results,
    };
  }

  private lexicalScoreSql(queryParameter: string): string {
    return `
      GREATEST(
        CASE
          WHEN to_tsvector('english', chunk.content)
            @@ plainto_tsquery('english', ${queryParameter})
          THEN 1.0
          ELSE 0.0
        END,
        word_similarity(lower(${queryParameter}), lower(chunk.content)),
        COALESCE((
          SELECT AVG(word_similarity(term.value, lower(chunk.content)))
          FROM regexp_split_to_table(
            lower(${queryParameter}),
            '[^[:alnum:]]+'
          ) AS term(value)
          WHERE length(term.value) >= 4
            AND term.value NOT IN (
              'what', 'when', 'where', 'which', 'whose',
              'would', 'could', 'should', 'there', 'their',
              'about', 'explain', 'define', 'learn', 'want', 'please'
            )
        ), 0.0)
      )
    `;
  }

  private mapCandidate(
    row: SearchRow,
    threshold: number,
  ): CorpusSearchCandidate {
    const semanticSimilarity = Number(row.semanticSimilarity);
    const lexicalSimilarity = Number(row.lexicalSimilarity);
    const hybridScore = Number(row.hybridScore);
    const semanticRank =
      row.semanticRank === null ? null : Number(row.semanticRank);
    const lexicalRank =
      row.lexicalRank === null ? null : Number(row.lexicalRank);
    const matchedBy: Array<'semantic' | 'lexical'> = [];

    if (semanticRank !== null) matchedBy.push('semantic');
    if (lexicalRank !== null) matchedBy.push('lexical');

    return {
      ...row,
      similarity: semanticSimilarity,
      semanticSimilarity,
      lexicalSimilarity,
      hybridScore,
      semanticRank,
      lexicalRank,
      matchedBy,
      accepted: hybridScore >= threshold,
    };
  }
}
