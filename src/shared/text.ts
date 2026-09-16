/** Keep offsets stable after canonicalizing whitespace for quote matching. */
export function normalizeText(text: string): string {
  return text.replace(/[\s\u00a0\u200b]+/gu, " ").trim();
}
export function truncateText(
  text: string,
  limit: number,
): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  let end = text.lastIndexOf("\n\n", limit);
  if (end < limit / 2) end = limit;
  // Avoid splitting a UTF-16 surrogate pair.
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return { text: text.slice(0, end).trimEnd(), truncated: true };
}
