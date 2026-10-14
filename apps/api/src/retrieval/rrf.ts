/** Reciprocal rank fusion (docs/09): score = Σ 1/(k + rank), k = 60. */
export const RRF_K = 60;

export type RankedId = { id: string; rank: number };

/**
 * Fuse multiple ranked lists. Ranks are 1-based (first hit = 1).
 * Items only in one list still score from that list alone.
 */
export function reciprocalRankFusion(
  lists: RankedId[][],
  k: number = RRF_K,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const item of list) {
      if (item.rank < 1) continue;
      const prev = scores.get(item.id) ?? 0;
      scores.set(item.id, prev + 1 / (k + item.rank));
    }
  }
  return scores;
}

/** Sort fused scores descending; return ids. */
export function rrfTopIds(
  lists: RankedId[][],
  limit: number,
  k: number = RRF_K,
): Array<{ id: string; score: number }> {
  const scores = reciprocalRankFusion(lists, k);
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
