import { stripCitationMarkers } from './citation-markers';

describe('stripCitationMarkers', () => {
  it('removes only known canonical citation markers', () => {
    const answer =
      'Cells are units of life. [chunk-1]\n\nUse concentration [mol/L]. [chunk-2]';

    expect(stripCitationMarkers(answer, ['chunk-1', 'chunk-2'])).toBe(
      'Cells are units of life.\n\nUse concentration [mol/L].',
    );
  });

  it('escapes citation IDs before constructing the matcher', () => {
    expect(
      stripCitationMarkers('Supported. [chunk.1+test]', ['chunk.1+test']),
    ).toBe('Supported.');
  });
});
