import { estimateTokens } from "./estimate-tokens";

export type ScoredPassage = {
  id: string;
  text: string;
  /** Higher = keep preferentially when over budget. */
  score: number;
};

export type TrimScoredResult<T extends ScoredPassage> = {
  kept: T[];
  droppedIds: string[];
  tokens: number;
};

/**
 * Keep highest-scoring items until the token budget is filled.
 * Drops lowest score first (docs/06). Tie-break: prefer keeping earlier ids stably.
 */
export function trimScoredToBudget<T extends ScoredPassage>(
  items: T[],
  budgetTokens: number,
): TrimScoredResult<T> {
  if (budgetTokens <= 0 || items.length === 0) {
    return {
      kept: [],
      droppedIds: items.map((i) => i.id),
      tokens: 0,
    };
  }

  const ranked = [...items].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const kept: T[] = [];
  let tokens = 0;
  const keptIds = new Set<string>();

  for (const item of ranked) {
    const cost = estimateTokens(item.text);
    if (kept.length > 0 && tokens + cost > budgetTokens) {
      continue;
    }
    // Always try to keep at least one if the first alone exceeds budget (truncated caller).
    if (kept.length === 0 && cost > budgetTokens) {
      kept.push({
        ...item,
        text: truncateToTokens(item.text, budgetTokens),
      });
      tokens = estimateTokens(kept[0]!.text);
      keptIds.add(item.id);
      break;
    }
    kept.push(item);
    tokens += cost;
    keptIds.add(item.id);
  }

  // Restore original relative order among kept (by input index).
  const order = new Map(items.map((it, i) => [it.id, i]));
  kept.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return {
    kept,
    droppedIds: items.filter((i) => !keptIds.has(i.id)).map((i) => i.id),
    tokens,
  };
}

/** Drop oldest turns first until under budget (recent turns stay). */
export function trimTurnsToBudget(
  turns: Array<{ role: "user" | "assistant"; content: string }>,
  budgetTokens: number,
): {
  kept: Array<{ role: "user" | "assistant"; content: string }>;
  droppedCount: number;
  tokens: number;
} {
  if (budgetTokens <= 0) {
    return { kept: [], droppedCount: turns.length, tokens: 0 };
  }
  let start = 0;
  let tokens = turns.reduce((s, t) => s + estimateTokens(t.content), 0);
  while (start < turns.length && tokens > budgetTokens) {
    tokens -= estimateTokens(turns[start]!.content);
    start += 1;
  }
  const kept = turns.slice(start);
  return {
    kept,
    droppedCount: start,
    tokens: kept.reduce((s, t) => s + estimateTokens(t.content), 0),
  };
}

export function truncateToTokens(text: string, budgetTokens: number): string {
  if (budgetTokens <= 0) return "";
  if (estimateTokens(text) <= budgetTokens) return text;
  // char/4 estimator → ~4 chars per token
  const maxChars = Math.max(1, budgetTokens * 4);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function clampTextToBudget(
  text: string | null | undefined,
  budgetTokens: number,
): { text: string; tokens: number; truncated: boolean } {
  const raw = (text ?? "").trim();
  if (!raw) return { text: "", tokens: 0, truncated: false };
  if (estimateTokens(raw) <= budgetTokens) {
    return { text: raw, tokens: estimateTokens(raw), truncated: false };
  }
  const truncated = truncateToTokens(raw, budgetTokens);
  return {
    text: truncated,
    tokens: estimateTokens(truncated),
    truncated: true,
  };
}
