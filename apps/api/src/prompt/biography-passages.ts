/**
 * Biography is owner prose, not document_chunks — hybrid retrieval never sees it.
 * Select overlapping paragraphs so facts past the short bio prefix still reach chat.
 */
import { scorePassageOverlap } from "../retrieval/query-expand";

export function splitBiographyPassages(biography: string): string[] {
  return biography
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40);
}

export function selectBiographyPassages(
  biography: string | null | undefined,
  query: string,
  opts?: {
    limit?: number;
    maxChars?: number;
    downweightNames?: string[];
  },
): string[] {
  const bio = biography?.trim() ?? "";
  if (!bio) return [];
  const passages = splitBiographyPassages(bio);
  if (passages.length === 0) return [];
  if (!query.trim()) return [];

  const scored = passages
    .map((p) => ({
      p,
      hits: scorePassageOverlap(p, query, {
        downweightNames: opts?.downweightNames,
      }),
    }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.p.length - a.p.length);

  const limit = opts?.limit ?? 3;
  const maxChars = opts?.maxChars ?? 2_400;
  const out: string[] = [];
  let used = 0;
  for (const { p } of scored.slice(0, limit * 2)) {
    if (out.length >= limit) break;
    if (used + p.length > maxChars) continue;
    out.push(p);
    used += p.length;
  }
  return out;
}
