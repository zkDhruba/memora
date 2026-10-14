/**
 * 3.9 — Citation marker hygiene + factual abstention rewrite (docs/06, docs/09).
 * Pure functions — no I/O.
 */

import { isSoftIdentityQuery } from "../retrieval/soft-identity-query";

const MARKER_RE = /\[\[([cm]\d+)\]\]/g;

/** English / Bangla question cues that ask for a recordable fact. */
const FACTUAL_EN =
  /\b(who|when|where|which|what\s+happened|what\s+about|how\s+old|how\s+many|born|died|father|mother|parents?|husband|wife|brother|sister|year|date|night|cyclone|sidr|sidor)\b/i;

// No \b around Bangla script — JS word boundaries are ASCII-only.
const FACTUAL_BN =
  /(কবে|কোথায়|কি\s*হয়|কী\s*হয়|\bbaba\b|\bbap\b|\babbu\b|\bamma\b|\braat\b|\bjonmo\b|\bnirjatito\b|\bhoyesilo\b|\bhoyechilo\b|\bbhai\b|\bbon\b|\bkoy\b|\bkoto\b|\blebuwali\b)/i;

/** Soft chat / identity probes — do not force citation or abstention. */
const SMALL_TALK =
  /\b(hi|hello|hey|thanks|thank\s+you|ok|okay|lol|haha|good\s+night|good\s+morning|ki\s+koro|kemon\s+acho|kmn\s*acho)\b/i;

/** Clarifiers / reactions — not standalone biographical asks. */
const CLARIFIER_ONLY =
  /^(what|huh|eh|hmm+|hm+|ok|okay|hae|han|ki|k|keno|why|really|seriously)[\s?!.,]*$/i;

/** Short WhatsApp-like abstentions — never sound like a helpdesk. */
export const ABSTENTION_EN = "Hmm, that isn't in what I've got.";

export const ABSTENTION_BN = "Hmm\nSeta amar kase clear nai.";

const SOFT_DENY =
  /\b(mone\s*(nei|nai|porche\s*na)|janina|jani\s*na|janni\s*na|records?\s*e\s*(nei|nai)|don't know|do not know|not sure|not in (the )?records?|can't remember|cannot remember)\b/i;

/** Model already soft-refused without inventing a countable/named fact. */
export function looksLikeHumanSoftDeny(reply: string): boolean {
  const t = stripMarkers(reply);
  if (!t || t.length > 180) return false;
  // Invented headcounts / dated claims — do not keep.
  if (/\b\d+\s*(bhai|bon|brother|sister|year|bochor)\b/i.test(t)) return false;
  if (/\b(one|two|three|four|five|six)\s+(brother|sister|sibling)/i.test(t)) {
    return false;
  }
  if (/\b(19|20)\d{2}\b/.test(t)) return false;
  return SOFT_DENY.test(t) || /^(hm+|hmm+|nah+|na)[\s,.!]*/i.test(t);
}

export type CitationRef = {
  marker: string;
  kind: "chunk" | "memory";
  chunkId?: string;
  memoryId?: string;
};

export type CitationAbstentionInput = {
  userMessage: string;
  reply: string;
  citationMap: Record<string, string>;
  memoryMap: Record<string, string>;
};

export type CitationAbstentionResult = {
  content: string;
  citations: CitationRef[];
  abstained: boolean;
  /** Markers the model emitted that were not in the maps (stripped). */
  unknownMarkers: string[];
};

export function extractMarkers(text: string): string[] {
  return [...text.matchAll(MARKER_RE)].map((m) => m[1]!);
}

export function isFactualBiographicalQuery(userMessage: string): boolean {
  const q = userMessage.trim();
  if (!q || q.length < 2) return false;
  // Soft identity ("who are you?", "amk chinte parso") must not force abstention.
  if (isSoftIdentityQuery(q)) return false;
  if (CLARIFIER_ONLY.test(q)) return false;
  if (SMALL_TALK.test(q) && !FACTUAL_EN.test(q) && !FACTUAL_BN.test(q)) {
    return false;
  }
  if (FACTUAL_EN.test(q) || FACTUAL_BN.test(q)) return true;
  // Year asks are factual.
  if (/\b(19|20)\d{2}\b/.test(q)) return true;
  // "Name k?" / "Name ke?" style who-asks (romanized Bangla).
  if (/\b[A-Za-z][A-Za-z-]{2,}\s+k(e)?\s*\??$/i.test(q)) return true;
  return false;
}

function prefersBanglish(userMessage: string): boolean {
  return (
    /[অ-৯]/.test(userMessage) ||
    /\b(ami|tumi|tmi|tmra|tomar|amar|kotha|hoyesilo|mone|parbo|rae?t|baba|bap|bhai|bon|koy|koto|ki|ke|keno|bolcho|acho)\b/i.test(
      userMessage,
    )
  );
}

export function abstentionCopy(userMessage: string): string {
  return prefersBanglish(userMessage) ? ABSTENTION_BN : ABSTENTION_EN;
}

/** Remove all [[cN]] / [[mN]] markers; collapse leftover spaces. */
export function stripMarkers(text: string): string {
  return text
    .replace(MARKER_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * Map used markers → citation rows; drop unknown markers; abstain when a
 * factual question has zero valid citations (docs/09 must-abstain).
 */
export function applyCitationAbstention(
  input: CitationAbstentionInput,
): CitationAbstentionResult {
  const valid = new Set([
    ...Object.keys(input.citationMap),
    ...Object.keys(input.memoryMap),
  ]);
  const used = extractMarkers(input.reply);
  const unknownMarkers = [...new Set(used.filter((m) => !valid.has(m)))];
  const usedValid = [...new Set(used.filter((m) => valid.has(m)))];

  const citations: CitationRef[] = usedValid.map((marker) => {
    if (input.citationMap[marker]) {
      return {
        marker,
        kind: "chunk" as const,
        chunkId: input.citationMap[marker],
      };
    }
    return {
      marker,
      kind: "memory" as const,
      memoryId: input.memoryMap[marker],
    };
  });

  const factual = isFactualBiographicalQuery(input.userMessage);
  if (factual && citations.length === 0) {
    // Prefer the model's own short soft-deny when it didn't invent numbers/dates.
    const content = looksLikeHumanSoftDeny(input.reply)
      ? stripMarkers(input.reply)
      : abstentionCopy(input.userMessage);
    return {
      content,
      citations: [],
      abstained: true,
      unknownMarkers,
    };
  }

  return {
    content: stripMarkers(input.reply),
    citations,
    abstained: false,
    unknownMarkers,
  };
}
