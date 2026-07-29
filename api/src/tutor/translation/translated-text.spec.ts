import { normalizeTranslatedText } from './translated-text';

describe('normalizeTranslatedText', () => {
  it('turns a fully escaped lesson into real paragraphs', () => {
    expect(
      normalizeTranslatedText(
        'Introduction.\\n\\n## Wetin be cell?\\n\\nA **cell** na unit of life.',
      ),
    ).toBe('Introduction.\n\n## Wetin be cell?\n\nA **cell** na unit of life.');
  });

  it('does not reinterpret backslashes in an already multiline lesson', () => {
    expect(
      normalizeTranslatedText('Line one.\n\nUse \\nu in this formula.'),
    ).toBe('Line one.\n\nUse \\nu in this formula.');
  });
});
