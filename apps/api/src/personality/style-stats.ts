export type StyleStatMessage = {
  id: string;
  body: string;
  /** First/last line of thread when known — optional. */
  isThreadFirst?: boolean;
  isThreadLast?: boolean;
};

export type StyleStats = {
  messageCount: number;
  medianChars: number;
  questionMarkRate: number;
  emojiRate: number;
  scriptMix: {
    bengaliShare: number;
    latinShare: number;
    otherShare: number;
  };
  topPhrases: Array<{ phrase: string; count: number }>;
  greetingCandidates: string[];
  farewellCandidates: string[];
  exampleMessageIds: string[];
  limitedEvidence: boolean;
};

const BENGALI = /[\u0980-\u09FF]/;
const LATIN = /[A-Za-z]/;
const EMOJI =
  /\p{Extended_Pictographic}/gu;
const STOP = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "is",
    "it",
    "i",
    "you",
    "me",
    "my",
    "we",
    "আমি",
    "তুমি",
    "এবং",
  ].map((s) => s.toLowerCase()),
);

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0
    ? Math.round((s[mid - 1]! + s[mid]!) / 2)
    : s[mid]!;
}

function scriptShares(text: string) {
  let bn = 0;
  let la = 0;
  let other = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (BENGALI.test(ch)) bn++;
    else if (LATIN.test(ch)) la++;
    else other++;
  }
  const total = bn + la + other || 1;
  return {
    bengaliShare: bn / total,
    latinShare: la / total,
    otherShare: other / total,
  };
}

function ngrams(text: string, n: number): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * Deterministic class-B style measurements from the subject's own turns.
 */
export function computeStyleStats(messages: StyleStatMessage[]): StyleStats {
  const lengths = messages.map((m) => m.body.length);
  const withQ = messages.filter((m) => m.body.includes("?")).length;
  const withEmoji = messages.filter((m) => (m.body.match(EMOJI) ?? []).length > 0)
    .length;

  const allText = messages.map((m) => m.body).join("\n");
  const phraseCounts = new Map<string, number>();
  for (const m of messages) {
    for (let n = 2; n <= 5; n++) {
      for (const p of ngrams(m.body, n)) {
        phraseCounts.set(p, (phraseCounts.get(p) ?? 0) + 1);
      }
    }
  }
  const topPhrases = [...phraseCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([phrase, count]) => ({ phrase, count }));

  const greetings = new Set<string>();
  const farewells = new Set<string>();
  for (const m of messages) {
    const lines = m.body
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines[0] && (m.isThreadFirst || lines.length === 1)) {
      if (lines[0]!.length <= 40) greetings.add(lines[0]!);
    }
    if (lines.length && (m.isThreadLast || lines.length === 1)) {
      const last = lines[lines.length - 1]!;
      if (last.length <= 40) farewells.add(last);
    }
  }

  return {
    messageCount: messages.length,
    medianChars: median(lengths),
    questionMarkRate: messages.length ? withQ / messages.length : 0,
    emojiRate: messages.length ? withEmoji / messages.length : 0,
    scriptMix: scriptShares(allText),
    topPhrases,
    greetingCandidates: [...greetings].slice(0, 8),
    farewellCandidates: [...farewells].slice(0, 8),
    exampleMessageIds: messages.slice(0, 3).map((m) => m.id),
    limitedEvidence: messages.length < 30,
  };
}

/**
 * Class-B trait drafts whose quotes are substrings of the corpus
 * (median length / script mix stay on styleStats only — not fake quotes).
 */
export function styleStatsToTraitDrafts(stats: StyleStats): Array<{
  facet: "lexicon" | "greeting" | "farewell";
  value: string;
  quote: string;
  confidence: number;
}> {
  const drafts: Array<{
    facet: "lexicon" | "greeting" | "farewell";
    value: string;
    quote: string;
    confidence: number;
  }> = [];

  if (stats.messageCount === 0) return drafts;

  for (const p of stats.topPhrases.slice(0, 5)) {
    drafts.push({
      facet: "lexicon",
      value: `Often uses “${p.phrase}”`,
      quote: p.phrase,
      confidence: Math.min(0.95, 0.5 + p.count * 0.1),
    });
  }
  for (const g of stats.greetingCandidates.slice(0, 3)) {
    drafts.push({
      facet: "greeting",
      value: `Greeting candidate: ${g}`,
      quote: g,
      confidence: 0.7,
    });
  }
  for (const f of stats.farewellCandidates.slice(0, 3)) {
    drafts.push({
      facet: "farewell",
      value: `Farewell candidate: ${f}`,
      quote: f,
      confidence: 0.7,
    });
  }
  return drafts;
}
