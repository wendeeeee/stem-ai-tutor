export function normalizeLessonText(text: string): string {
  const normalizedNewlines = text.replace(/\r\n?/g, "\n");
  if (
    normalizedNewlines.includes("\n") ||
    !normalizedNewlines.includes("\\n")
  ) {
    return normalizedNewlines.trim();
  }

  return normalizedNewlines
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
}
