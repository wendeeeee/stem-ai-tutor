import { ConfigService } from '@nestjs/config';
import { TextChunkerService } from './text-chunker.service';

describe('TextChunkerService', () => {
  const config = {
    get: jest.fn((key: string, fallback: number) => {
      const values: Record<string, number> = {
        CHUNK_MAX_CHARACTERS: 500,
        CHUNK_OVERLAP_CHARACTERS: 50,
      };
      return values[key] ?? fallback;
    }),
  } as unknown as ConfigService;
  const service = new TextChunkerService(config);

  it('creates stable page-attributed chunks', () => {
    const pages = [
      {
        pageNumber: 3,
        text: `${'Physical changes preserve the substance. '.repeat(20)}Chemical changes create new substances.`,
      },
    ];

    const first = service.chunk('document-1', pages);
    const second = service.chunk('document-1', pages);

    expect(first.length).toBeGreaterThan(1);
    expect(first).toEqual(second);
    expect(first.every((chunk) => chunk.pageStart === 3)).toBe(true);
    expect(first.every((chunk) => chunk.sourceLocator === 'page 3')).toBe(true);
    expect(first.every((chunk) => chunk.content.length <= 500)).toBe(true);
  });

  it('does not emit chunks for empty pages', () => {
    expect(
      service.chunk('document-1', [{ pageNumber: 1, text: '   ' }]),
    ).toEqual([]);
  });
});
