import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorpusSearchService } from '../../corpus/services/corpus-search.service';
import { ToolResult, TutorTool } from '../contracts/tool.contract';
import { isRecord, isToolResult } from '../contracts/validation';
import {
  CurriculumSearchInput,
  CurriculumSearchOutput,
} from '../contracts/workflow.contracts';
import { CURRICULUM_SEARCH_TOOL } from '../tutor.constants';

@Injectable()
export class CurriculumSearchTool implements TutorTool<
  CurriculumSearchInput,
  CurriculumSearchOutput
> {
  readonly name = CURRICULUM_SEARCH_TOOL;

  private readonly costPerMillionTokens: number;

  constructor(
    private readonly corpusSearch: CorpusSearchService,
    config: ConfigService,
  ) {
    this.costPerMillionTokens = Number(
      config.get<number | string>(
        'TUTOR_EMBEDDING_COST_PER_MILLION_TOKENS_USD',
        0.02,
      ),
    );
    if (
      !Number.isFinite(this.costPerMillionTokens) ||
      this.costPerMillionTokens < 0
    ) {
      throw new Error(
        'TUTOR_EMBEDDING_COST_PER_MILLION_TOKENS_USD must be zero or greater.',
      );
    }
  }

  validateInput(value: unknown): value is CurriculumSearchInput {
    return (
      isRecord(value) &&
      typeof value.query === 'string' &&
      value.query.trim().length >= 2 &&
      Number.isInteger(value.limit) &&
      Number(value.limit) >= 1 &&
      Number(value.limit) <= 20 &&
      typeof value.threshold === 'number' &&
      value.threshold >= 0 &&
      value.threshold <= 1 &&
      (value.subject === undefined || typeof value.subject === 'string') &&
      (value.schoolLevel === undefined || typeof value.schoolLevel === 'string')
    );
  }

  validateResult(value: unknown): value is ToolResult<CurriculumSearchOutput> {
    return isToolResult(value, (output): output is CurriculumSearchOutput => {
      if (!isRecord(output) || !Array.isArray(output.chunks)) return false;
      return output.chunks.every(
        (chunk) =>
          isRecord(chunk) &&
          typeof chunk.chunkId === 'string' &&
          typeof chunk.content === 'string',
      );
    });
  }

  async execute(
    input: CurriculumSearchInput,
  ): Promise<ToolResult<CurriculumSearchOutput>> {
    const result = await this.corpusSearch.search(input);
    const chunks = result.results.map((row) => ({
      chunkId: row.chunkId,
      content: row.content,
      topic: { id: row.topicId, label: row.topicLabel },
      locator: {
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
        sourceLocator: row.sourceLocator,
      },
      document: {
        id: row.documentId,
        sourceTitle: row.sourceTitle,
        sourceAuthor: row.sourceAuthor,
        sourcePublisher: row.sourcePublisher,
        sourceUrl: row.sourceUrl,
        sourceLicence: row.sourceLicence,
        subject: row.subject,
        schoolLevel: row.schoolLevel,
        curriculum: row.curriculum,
      },
      similarity: row.similarity,
      semanticSimilarity: row.semanticSimilarity,
      lexicalSimilarity: row.lexicalSimilarity,
      hybridScore: row.hybridScore,
      matchedBy: row.matchedBy,
      accepted: row.accepted,
    }));

    return {
      output: { chunks },
      usage: {
        tokens: {
          input: result.embedding.inputTokens,
          output: 0,
          total: result.embedding.inputTokens,
        },
        estimatedCostUsd:
          (result.embedding.inputTokens / 1_000_000) *
          this.costPerMillionTokens,
      },
      summary: {
        candidateCount: chunks.length,
        acceptedCount: result.acceptedCount,
        threshold: result.threshold,
        topCandidate: result.topCandidate,
      },
    };
  }
}
