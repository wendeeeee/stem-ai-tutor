export interface SpeechChunkingOptions {
  minimumCharacters: number;
  preferredCharacters: number;
  maximumCharacters: number;
}

type BoundaryKind = 'paragraph' | 'sentence' | 'clause';

interface Boundary {
  index: number;
  kind: BoundaryKind;
}

const abbreviations = new Set([
  'dr',
  'e.g',
  'etc',
  'i.e',
  'mr',
  'mrs',
  'ms',
  'no',
  'prof',
  'sr',
  'st',
  'vs',
]);

export function normalizeSpeechPunctuation(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s*→\s*/g, ' to ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *,([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkSpeechText(
  rawText: string,
  options: SpeechChunkingOptions,
): string[] {
  const text = normalizeSpeechPunctuation(rawText);
  if (!text) return [];
  if (text.length <= options.maximumCharacters) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > options.maximumCharacters) {
    const boundaries = findBoundaries(remaining, options.maximumCharacters);
    const breakAt = selectBoundary(boundaries, options);
    const safeBreak =
      breakAt ?? safeHardBoundary(remaining, options.maximumCharacters);
    const chunk = remaining.slice(0, safeBreak).trim();
    if (!chunk) {
      throw new Error('SPEECH_CHUNKING_FAILED');
    }
    chunks.push(chunk);
    remaining = remaining.slice(safeBreak).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function findBoundaries(text: string, maximum: number): Boundary[] {
  const boundaries: Boundary[] = [];
  let nestingDepth = 0;
  for (let index = 0; index < Math.min(text.length, maximum); index += 1) {
    const character = text[index];
    if (character === '(' || character === '[' || character === '{') {
      nestingDepth += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      nestingDepth = Math.max(0, nestingDepth - 1);
      continue;
    }
    if (nestingDepth > 0) continue;

    if (character === '\n' && text[index + 1] === '\n') {
      boundaries.push({ index, kind: 'paragraph' });
      index += 1;
      continue;
    }
    if (
      (character === '.' || character === '!' || character === '?') &&
      isSentenceBoundary(text, index)
    ) {
      boundaries.push({ index: index + 1, kind: 'sentence' });
      continue;
    }
    if (
      (character === ',' ||
        character === ';' ||
        character === ':' ||
        character === '\n') &&
      isFollowedByWhitespace(text, index)
    ) {
      boundaries.push({ index: index + 1, kind: 'clause' });
    }
  }
  return boundaries;
}

function selectBoundary(
  boundaries: readonly Boundary[],
  options: SpeechChunkingOptions,
): number | null {
  const preference: BoundaryKind[] = ['paragraph', 'sentence', 'clause'];
  for (const kind of preference) {
    const candidates = boundaries.filter(
      (boundary) =>
        boundary.kind === kind &&
        boundary.index >= options.minimumCharacters &&
        boundary.index <= options.maximumCharacters,
    );
    if (candidates.length > 0) {
      return closestToPreferred(candidates, options.preferredCharacters).index;
    }
  }

  const earlierNaturalBoundaries = boundaries.filter(
    (boundary) =>
      boundary.index > 0 && boundary.index < options.minimumCharacters,
  );
  if (earlierNaturalBoundaries.length > 0) {
    return earlierNaturalBoundaries.reduce((latest, boundary) =>
      boundary.index > latest.index ? boundary : latest,
    ).index;
  }
  return null;
}

function closestToPreferred(
  boundaries: readonly Boundary[],
  preferred: number,
): Boundary {
  return boundaries.reduce((best, boundary) => {
    const distance = Math.abs(boundary.index - preferred);
    const bestDistance = Math.abs(best.index - preferred);
    if (distance !== bestDistance)
      return distance < bestDistance ? boundary : best;
    return boundary.index > best.index ? boundary : best;
  });
}

function safeHardBoundary(text: string, maximum: number): number {
  let nestingDepth = 0;
  let lastSafeWhitespace = 0;
  for (let index = 0; index <= Math.min(maximum, text.length - 1); index += 1) {
    nestingDepth = nextNestingDepth(nestingDepth, text[index]);
    if (nestingDepth === 0 && /\s/u.test(text[index] ?? '')) {
      lastSafeWhitespace = index;
    }
  }
  if (lastSafeWhitespace > 0) return lastSafeWhitespace;

  for (let index = maximum + 1; index < text.length; index += 1) {
    nestingDepth = nextNestingDepth(nestingDepth, text[index]);
    if (nestingDepth === 0 && /\s/u.test(text[index] ?? '')) return index;
  }
  return text.length;
}

function nextNestingDepth(
  depth: number,
  character: string | undefined,
): number {
  if (character === '(' || character === '[' || character === '{') {
    return depth + 1;
  }
  if (character === ')' || character === ']' || character === '}') {
    return Math.max(0, depth - 1);
  }
  return depth;
}

function isSentenceBoundary(text: string, index: number): boolean {
  if (!isFollowedByWhitespace(text, index)) return false;
  if (text[index] !== '.') return true;
  if (/\d/u.test(text[index - 1] ?? '') && /\d/u.test(text[index + 1] ?? '')) {
    return false;
  }
  const prefix = text.slice(0, index);
  const token = prefix.match(/([\p{L}.]+)$/u)?.[1]?.toLowerCase() ?? '';
  if (abbreviations.has(token.replace(/\.$/u, ''))) return false;
  if (/^(?:[\p{L}]\.)+[\p{L}]?$/u.test(token)) return false;
  if (
    /^\d+$/u.test(prefix.match(/(\S+)$/u)?.[1]?.replace(/\.$/u, '') ?? '') &&
    (index === 1 || text[index - 2] === '\n')
  ) {
    return false;
  }
  return true;
}

function isFollowedByWhitespace(text: string, index: number): boolean {
  return index + 1 >= text.length || /\s/u.test(text[index + 1] ?? '');
}
