export function stripCitationMarkers(
  text: string,
  citationIds: readonly string[],
): string {
  const escapedIds = citationIds
    .filter(Boolean)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escapedIds.length === 0) return text;

  return text
    .replace(new RegExp(`[ \\t]*\\[(?:${escapedIds.join("|")})\\]`, "g"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
