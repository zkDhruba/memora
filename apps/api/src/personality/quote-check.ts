/**
 * Anti-hallucination gate (docs/07): supporting quote must appear in the
 * extraction input corpus. Soft-normalize whitespace for matching.
 */
export function normalizeForQuoteMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function quoteIsGrounded(quote: string, corpus: string): boolean {
  const q = normalizeForQuoteMatch(quote);
  if (q.length < 2 || q.length > 280) return false;
  const hay = normalizeForQuoteMatch(corpus);
  if (hay.includes(q)) return true;
  // Also try raw substring (preserves intentional spacing in short quotes).
  return corpus.includes(quote.trim());
}

export function filterGroundedTraits<
  T extends { quote: string; value: string },
>(candidates: T[], corpus: string): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const c of candidates) {
    if (quoteIsGrounded(c.quote, corpus)) kept.push(c);
    else dropped.push(c);
  }
  return { kept, dropped };
}
