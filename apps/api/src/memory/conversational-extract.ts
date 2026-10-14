/**
 * Deterministic extractors for chat → conversational memories (docs/08).
 * Never invent biographical life events — only what the user told *this* simulation.
 */

export type ConversationalCandidate = {
  memoryType: "session_fact" | "session_preference";
  /** Canonical text stored on the memory row. */
  text: string;
  /** Substring from the user message for optional evidence quote. */
  quote: string;
};

function cleanName(raw: string): string | null {
  const n = raw
    .replace(/["'`]/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();
  if (n.length < 2 || n.length > 40) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s.'-]{0,38}$/u.test(n)) return null;
  return n;
}

/** Preference: how the user wants to be addressed in this chat. */
const PREFERENCE_PATTERNS: Array<{
  re: RegExp;
  group: number;
}> = [
  { re: /\b(?:please\s+)?call\s+me(?:\s+by)?\s+["']?([^"'?.!,]{2,40})/i, group: 1 },
  { re: /\baddress\s+me\s+as\s+["']?([^"'?.!,]{2,40})/i, group: 1 },
  { re: /\b(?:my\s+)?(?:nick\s*name|nickname)\s+is\s+["']?([^"'?.!,]{2,40})/i, group: 1 },
  { re: /\bamar\s+naam\s+["']?([^"'?.!,]{2,40})/i, group: 1 },
  { re: /\bamake\s+["']?([^"'?.!,]{2,40})\s+dak(?:o|be|ben)?/i, group: 1 },
  { re: /\b(?:bolo|dak)\s+amake\s+["']?([^"'?.!,]{2,40})/i, group: 1 },
];

/** Narrow session facts the user told the simulation about themselves. */
const FACT_PATTERNS: Array<{
  re: RegExp;
  toText: (m: RegExpMatchArray) => string | null;
}> = [
  {
    re: /\b(?:i\s+have|i'?ve\s+got)\s+(?:an?\s+)?exam\b/i,
    toText: () => "User told the simulation they have an exam.",
  },
  {
    re: /\b(?:amar|ami)\s+exam\b/i,
    toText: () => "User told the simulation they have an exam.",
  },
  {
    re: /\bi(?:'?m|\s+am)\s+(?:going\s+to|gonna)\s+(.{3,60}?)(?:[.!?]|$)/i,
    toText: (m) => {
      const detail = m[1]?.trim().replace(/\s+/g, " ");
      if (!detail || detail.length < 3) return null;
      return `User told the simulation they are going to ${detail}.`;
    },
  },
  {
    re: /\bmy\s+(?:friend'?s?\s+)?name\s+is\s+["']?([^"'?.!,]{2,40})/i,
    toText: (m) => {
      const n = cleanName(m[1] ?? "");
      return n ? `User told the simulation a name in chat: ${n}.` : null;
    },
  },
];

/**
 * Extract zero or more conversational candidates from a single user turn.
 * High precision over recall — skip vague chat.
 */
export function extractConversationalCandidates(
  userMessage: string,
): ConversationalCandidate[] {
  const q = userMessage.trim();
  if (q.length < 4 || q.length > 500) return [];

  const out: ConversationalCandidate[] = [];
  const seen = new Set<string>();

  for (const p of PREFERENCE_PATTERNS) {
    const m = q.match(p.re);
    if (!m) continue;
    const name = cleanName(m[p.group] ?? "");
    if (!name) continue;
    const text = `User prefers to be called "${name}".`;
    const key = `pref:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      memoryType: "session_preference",
      text,
      quote: m[0].slice(0, 280),
    });
  }

  for (const p of FACT_PATTERNS) {
    const m = q.match(p.re);
    if (!m) continue;
    const text = p.toText(m);
    if (!text) continue;
    const key = `fact:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      memoryType: "session_fact",
      text,
      quote: m[0].slice(0, 280),
    });
  }

  return out;
}

export function normalizeMemoryText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
