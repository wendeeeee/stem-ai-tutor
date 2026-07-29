import { toSpeechText } from './speech-text';

describe('toSpeechText', () => {
  it('removes Markdown presentation markers while preserving lesson content', () => {
    const answer = `Hi, I can see you met this topic in class today. Let us make it clearer together.

### First, what is a **cell**?

- **Cell membrane:** controls what enters and leaves.
- [Nucleus](https://example.test): controls cell activities.

**Analogy:** Think of each cell as a tiny working unit.`;

    const expected = `Hi, I can see you met this topic in class today. Let us make it clearer together.

First, what is a cell?

Cell membrane: controls what enters and leaves.
Nucleus: controls cell activities.

Analogy: Think of each cell as a tiny working unit.`;

    expect(toSpeechText(answer)).toBe(expected);
  });

  it('preserves ordinary punctuation and inline formula text', () => {
    expect(toSpeechText('Use `E_k = 1/2 mv^2` in this example.')).toBe(
      'Use E_k = 1/2 mv^2 in this example.',
    );
  });

  it('does not speak known internal citation IDs', () => {
    expect(
      toSpeechText(
        'Cells are units of life. [1522783e22af5bb79a3dcc155bf6f8d2d41556da9b40dae8762e1c563def79b8]',
        ['1522783e22af5bb79a3dcc155bf6f8d2d41556da9b40dae8762e1c563def79b8'],
      ),
    ).toBe('Cells are units of life.');
  });

  it('turns escaped paragraph markers into speech pauses', () => {
    expect(
      toSpeechText(
        'Introduction.\\n\\n## Wetin be cell?\\n\\nA **cell** na unit of life.',
      ),
    ).toBe('Introduction.\n\nWetin be cell?\n\nA cell na unit of life.');
  });
});
