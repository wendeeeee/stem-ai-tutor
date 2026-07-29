import {
  chunkSpeechText,
  normalizeSpeechPunctuation,
} from './speech-text-chunker';

const options = {
  minimumCharacters: 400,
  preferredCharacters: 550,
  maximumCharacters: 700,
};

describe('speech text chunking', () => {
  it('keeps text below the threshold in one chunk', () => {
    expect(chunkSpeechText('Energy na ability to do work.', options)).toEqual([
      'Energy na ability to do work.',
    ]);
  });

  it('prefers paragraph boundaries and preserves lesson order', () => {
    const paragraphs = [
      `First paragraph. ${'Cell membrane controls movement. '.repeat(12)}`,
      `Second paragraph. ${'Nucleus controls cell activity. '.repeat(12)}`,
      `Third paragraph. ${'Cytoplasm supports reactions. '.repeat(12)}`,
    ];
    const input = paragraphs.join('\n\n');
    const chunks = chunkSpeechText(input, options);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 700)).toBe(true);
    expect(chunks[0]).toContain('First paragraph');
    expect(chunks[1]).toContain('Second paragraph');
    expect(chunks.at(-1)).toContain('Third paragraph');
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(
      normalizeSpeechPunctuation(input).replace(/\s+/g, ' '),
    );
  });

  it('splits a long sentence at clauses without splitting words', () => {
    const input = `Photosynthesis uses light energy, ${'plants convert water and carbon dioxide into stored chemical energy; '.repeat(14)}and oxygen leaves the leaf.`;
    const chunks = chunkSpeechText(input, options);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 700)).toBe(true);
    expect(chunks.slice(0, -1).every((chunk) => /[,;:]$/u.test(chunk))).toBe(
      true,
    );
    expect(chunks.join(' ')).toBe(input);
  });

  it('normalizes unsupported punctuation and preserves diacritics', () => {
    const input =
      '“Ọ̀nà” → agbára—ọ bụ ọrụ (adenosine triphosphate, ATP). N’ihi ya…';
    const normalized = normalizeSpeechPunctuation(input);

    expect(normalized).toBe(
      '"Ọ̀nà" to agbára, ọ bụ ọrụ (adenosine triphosphate, ATP). N\'ihi ya...',
    );
    expect(normalized).toContain('Ọ̀nà');
    expect(normalized).toContain('agbára');
    expect(normalized).toContain('ọ bụ ọrụ');
  });

  it('does not treat abbreviations or numbered-list prefixes as sentence ends', () => {
    const input = `${'Background detail '.repeat(25)}\n1. Dr. Okafor explains ATP (i.e. adenosine triphosphate, a molecule used in cells) before the worked example, ${'with another supporting clause, '.repeat(12)}then the item ends.`;
    const chunks = chunkSpeechText(input, options);

    expect(chunks.some((chunk) => chunk.endsWith('1.'))).toBe(false);
    expect(chunks.some((chunk) => chunk.endsWith('Dr.'))).toBe(false);
    expect(chunks.some((chunk) => chunk.endsWith('i.e.'))).toBe(false);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(
      input.replace(/\s+/g, ' '),
    );
  });

  it('never cuts a single token merely to meet the nominal hard limit', () => {
    const longScientificToken = `poly${'deoxyribonucleotide'.repeat(40)}`;
    const chunks = chunkSpeechText(longScientificToken, options);

    expect(chunks).toEqual([longScientificToken]);
    expect(chunks[0].length).toBeGreaterThan(options.maximumCharacters);
  });
});
