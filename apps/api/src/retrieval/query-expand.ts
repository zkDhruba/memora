/**
 * Lightweight query expansion so Banglish typos / variants hit chat FTS
 * (e.g. user "Sidr" vs import "Sidor", "raat" vs "rat").
 */

/** Broader groups for passage scoring / embedding expansion. */
const SYNONYM_GROUPS: string[][] = [
  ["sidr", "sidor", "cyclone"],
  ["raat", "rat", "night"],
  ["baba", "bap", "abbu", "father"],
  ["amma", "ammu", "mother", "maa"],
  ["nirjatito", "nirjaton", "oppressed", "mistreatment"],
  ["room", "bedroom", "ghor"],
];

/**
 * High-precision variants for SQL keyword search.
 * Avoid short stems like "rat"/"night" — they flood with "Rate" / "Good night".
 */
const KEYWORD_SYNONYM_GROUPS: string[][] = [
  ["sidr", "sidor"],
  ["baba", "bap", "abbu"],
  ["amma", "ammu"],
  ["nirjatito", "nirjaton"],
];

const STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "your",
  "tumi",
  "tmi",
  "ami",
  "amar",
  "amr",
  "ki",
  "er",
  "a",
  "e",
  "o",
  "ta",
  "to",
  "hoyesilo",
  "hoye",
  "ache",
  "bolo",
  "bolte",
  "chao",
  "mane",
  "kintu",
  "about",
  "what",
  "that",
  "this",
  "with",
  "from",
  "have",
  "were",
  "was",
  "did",
  "does",
  "remember",
]);

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 24);
}

/** Content tokens for scoring (drop ultra-common chat glue). */
export function contentTokens(query: string): string[] {
  return tokenizeQuery(query).filter((t) => !STOP.has(t) && t.length >= 3);
}

/** Expand a token with synonym group peers (including itself). */
export function expandToken(token: string): string[] {
  const t = token.toLowerCase();
  for (const group of SYNONYM_GROUPS) {
    if (group.includes(t)) return [...new Set(group)];
  }
  return [t];
}

/** Precise tokens for keyword/ilike retrieval (avoids Good-night floods). */
export function keywordSearchTokens(query: string): string[] {
  const out = new Set<string>();
  for (const t of contentTokens(query)) {
    if (/^\d{4}$/.test(t)) {
      out.add(t);
      continue;
    }
    const group = KEYWORD_SYNONYM_GROUPS.find((g) => g.includes(t));
    if (group) {
      for (const g of group) out.add(g);
      continue;
    }
    // Keep distinctive literals only (skip short glue already filtered).
    if (t.length >= 5) out.add(t);
  }
  return [...out].slice(0, 8);
}

/**
 * Build a retrieval string that includes synonym variants.
 * Keeps original query first for embedding quality.
 */
export function expandQueryForRetrieval(query: string): string {
  const base = query.trim();
  if (!base) return base;
  const extras = new Set<string>();
  for (const t of contentTokens(base)) {
    for (const e of expandToken(t)) {
      if (e !== t) extras.add(e);
    }
  }
  if (extras.size === 0) return base;
  return `${base}\n${[...extras].join(" ")}`.slice(0, 1200);
}

/**
 * Score a passage against a query with year boosts and synonym hits.
 * Display-name tokens are down-weighted so "Ajin … 2007" does not drown Sidr.
 */
export function scorePassageOverlap(
  passage: string,
  query: string,
  opts?: { downweightNames?: string[] },
): number {
  const lower = passage.toLowerCase();
  const names = new Set(
    (opts?.downweightNames ?? []).map((n) => n.toLowerCase().trim()).filter(Boolean),
  );
  let score = 0;
  for (const t of contentTokens(query)) {
    const variants = expandToken(t);
    const matched = variants.some((v) => lower.includes(v));
    if (!matched) continue;
    if (/^\d{4}$/.test(t)) {
      score += 5;
    } else if (names.has(t)) {
      score += 0.25;
    } else if (variants.length > 1) {
      score += 2.5; // synonym-group hit (Sidr/Sidor etc.)
    } else {
      score += 1;
    }
  }
  return score;
}
