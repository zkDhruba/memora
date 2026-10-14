/**
 * Pick short subject chat lines for voice imitation.
 * Lexicon "Often uses X" traits are weak; real WhatsApp bursts carry cadence.
 */

const NOISE_TRAIT =
  /^(often uses|greeting candidate|farewell candidate)\b/i;

export function isNoisyStyleTrait(value: string): boolean {
  return NOISE_TRAIT.test(value.trim());
}

/** Flatten a chunk into 1–3 short lines suitable as style excerpts. */
export function linesFromChunk(content: string, maxLines = 3): string[] {
  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.length < 2 || l.length > 160) return false;
      if (/^(null|undefined|n\/a)$/i.test(l)) return false;
      if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(l))
        return false;
      return true;
    });
  return lines.slice(0, maxLines);
}

export function collectVoiceSamples(
  chunks: Array<{ content: string }>,
  limit = 10,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    for (const line of linesFromChunk(c.content, 4)) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Heuristic: persona chat should answer in Banglish/bn when samples look like it. */
export function inferChatLanguages(
  configured: string[] | null | undefined,
  samples: string[],
): string[] {
  const base = (configured?.length ? configured : ["en"]).map((l) =>
    l.toLowerCase(),
  );
  const banglish = samples.some((s) =>
    /\b(ami|tumi|tmi|koro|kichu|mone|nah|thak|bhalo|ki\b|er\b|amr)\b/i.test(
      s,
    ),
  );
  if (banglish && !base.includes("bn")) {
    return ["bn", ...base.filter((l) => l !== "bn")];
  }
  return base;
}
