import { stripCitationMarkers } from '../../tutor/citations/citation-markers';
import { normalizeTranslatedText } from '../../tutor/translation/translated-text';

export function toSpeechText(
  markdown: string,
  citationIds: readonly string[] = [],
): string {
  return stripCitationMarkers(normalizeTranslatedText(markdown), citationIds)
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^ {0,3}>[ \t]?/gm, '')
    .replace(/^ {0,3}(?:[-*_][ \t]*){3,}$/gm, '')
    .replace(/^ {0,3}[-+*][ \t]+/gm, '')
    .replace(/^ {0,3}(\d+)[.)][ \t]+/gm, '$1. ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/<[^>\n]+>/g, '')
    .replace(/\\([\\`*_[\]{}()#+.!>-])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
