import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ExtractedPage } from './pdf-extractor.service';

export interface PreparedChunk {
  id: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  contentHash: string;
  tokenEstimate: number;
  sourceLocator: string;
}

@Injectable()
export class TextChunkerService {
  private readonly maxCharacters: number;
  private readonly overlapCharacters: number;

  constructor(config: ConfigService) {
    this.maxCharacters = config.get<number>('CHUNK_MAX_CHARACTERS', 2400);
    this.overlapCharacters = config.get<number>(
      'CHUNK_OVERLAP_CHARACTERS',
      300,
    );

    if (
      this.maxCharacters < 500 ||
      this.overlapCharacters < 0 ||
      this.overlapCharacters >= this.maxCharacters / 2
    ) {
      throw new Error(
        'Chunk configuration must use at least 500 characters and overlap of less than half the chunk size.',
      );
    }
  }

  chunk(documentId: string, pages: ExtractedPage[]): PreparedChunk[] {
    const chunks: PreparedChunk[] = [];

    for (const page of pages) {
      const pageChunks = this.splitText(page.text);

      for (const content of pageChunks) {
        const chunkIndex = chunks.length;
        const contentHash = this.sha256(content);

        chunks.push({
          id: this.sha256(
            `${documentId}:${chunkIndex}:${page.pageNumber}:${contentHash}`,
          ),
          chunkIndex,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          content,
          contentHash,
          tokenEstimate: Math.max(1, Math.ceil(content.length / 4)),
          sourceLocator: `page ${page.pageNumber}`,
        });
      }
    }

    return chunks;
  }

  private splitText(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return [];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      let end = Math.min(start + this.maxCharacters, normalized.length);

      if (end < normalized.length) {
        const boundary = this.findBoundary(normalized, start, end);
        end = boundary > start ? boundary : end;
      }

      const chunk = normalized.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      if (end >= normalized.length) {
        break;
      }

      const nextStart = Math.max(0, end - this.overlapCharacters);
      start = nextStart > start ? nextStart : end;
    }

    return chunks;
  }

  private findBoundary(
    text: string,
    start: number,
    proposedEnd: number,
  ): number {
    const minimumBoundary = start + Math.floor(this.maxCharacters * 0.6);
    const segment = text.slice(minimumBoundary, proposedEnd);
    const sentenceEnd = Math.max(
      segment.lastIndexOf('. '),
      segment.lastIndexOf('? '),
      segment.lastIndexOf('! '),
    );

    if (sentenceEnd >= 0) {
      return minimumBoundary + sentenceEnd + 1;
    }

    const whitespace = segment.lastIndexOf(' ');
    return whitespace >= 0 ? minimumBoundary + whitespace : proposedEnd;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
