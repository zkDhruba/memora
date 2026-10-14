/**
 * Short relationship / identity questions that rarely match WhatsApp FTS tokens
 * (e.g. English "Do you remember me?" or Bangla "amk chinte parso" against chat).
 */
const SOFT_IDENTITY_EN =
  /\b(remember\s+me|know\s+me|who\s+am\s+i|who\s+are\s+you|what\s+do\s+you\s+know\s+about\s+me|have\s+we\s+(met|talked)|do\s+you\s+recall|tell\s+me\s+about\s+(yourself|you)|your\s+story)\b/i;

/** Romanized Bangla + short Bangla identity / recognition probes. */
const SOFT_IDENTITY_BN =
  /\b(amk?\s*chinte|chine?\s*paro|chine?\s*parso|mone\s*(ache|ase|porche)|tumi\s*ke|tmi\s*k|ami\s*ke|ke\s*tumi|ke\s*tmi|chinis|chinish|amake\s*chino|amar\s*kotha)\b/i;

export function isSoftIdentityQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return SOFT_IDENTITY_EN.test(q) || SOFT_IDENTITY_BN.test(q);
}

/**
 * Expand soft queries with persona/interlocutor names only.
 * Do not inject biography — that steers vector search away from chat imports.
 */
export function expandRetrievalQuery(
  query: string,
  _biography?: string | null,
  displayName?: string | null,
  interlocutorNames?: string[] | null,
): string {
  const base = query.trim();
  if (!isSoftIdentityQuery(base)) return base;

  const name = displayName?.trim() ?? "";
  const others = (interlocutorNames ?? [])
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return [base, name, others].filter(Boolean).join("\n").slice(0, 800);
}
