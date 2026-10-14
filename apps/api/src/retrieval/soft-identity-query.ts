/**
 * Short relationship / identity questions that rarely match WhatsApp FTS tokens
 * (e.g. English "Do you remember me?" against Bangla chat).
 */
const SOFT_IDENTITY =
  /\b(remember\s+me|know\s+me|who\s+am\s+i|who\s+are\s+you|what\s+do\s+you\s+know\s+about\s+me|have\s+we\s+(met|talked)|do\s+you\s+recall|tell\s+me\s+about\s+(yourself|you)|your\s+story)\b/i;

export function isSoftIdentityQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (SOFT_IDENTITY.test(q)) return true;
  // Ultra-short greetings alone are not enough; pair with remember-style only.
  return false;
}

/** Expand soft queries with biography keywords so vector/FTS have something to hit. */
export function expandRetrievalQuery(
  query: string,
  biography?: string | null,
  displayName?: string | null,
): string {
  const base = query.trim();
  if (!isSoftIdentityQuery(base)) return base;

  const bioBits = (biography ?? "")
    .split(/[\n.;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, 4)
    .join(" ");
  const name = displayName?.trim() ?? "";
  return [base, name, bioBits].filter(Boolean).join("\n").slice(0, 1200);
}
