/**
 * Plan chat-memory window (docs/22, task 3.10b).
 * Caps which Memora chat rows may enter model context.
 * Biographical memories are never passed through this helper.
 */

export type ChatWindowRow = {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  status: string;
  createdAt: Date;
};

export type ChatMemoryWindow<T extends ChatWindowRow> = {
  /** Newest first, at most `maxMessages` non-system rows. */
  kept: T[];
  /** createdAt of the oldest kept row; null when the window is empty. */
  cutoff: Date | null;
  /** Ids that fell outside the cap (oldest first among the dropped). */
  droppedIds: string[];
};

/**
 * `newestFirst` may include system rows; those do not consume a slot and are dropped.
 * Message 101 on Free (cap 100) is the oldest row and lands in `droppedIds`.
 */
export function applyChatMemoryWindow<T extends ChatWindowRow>(
  newestFirst: T[],
  maxMessages: number,
): ChatMemoryWindow<T> {
  const countable = newestFirst.filter((m) => m.role !== "system");
  const cap = Number.isFinite(maxMessages) ? Math.max(0, Math.floor(maxMessages)) : 0;
  const kept = countable.slice(0, cap);
  const keptIds = new Set(kept.map((m) => m.id));
  const droppedIds = countable
    .filter((m) => !keptIds.has(m.id))
    .map((m) => m.id);
  const cutoff = kept.length > 0 ? kept[kept.length - 1]!.createdAt : null;
  return { kept, cutoff, droppedIds };
}

export function conversationalInsideWindow<
  T extends { createdAt: Date; conversationSessionId: string | null },
>(rows: T[], sessionIds: Set<string>, cutoff: Date | null): T[] {
  if (!cutoff || sessionIds.size === 0) return [];
  const t = cutoff.getTime();
  return rows.filter(
    (r) =>
      !!r.conversationSessionId &&
      sessionIds.has(r.conversationSessionId) &&
      r.createdAt.getTime() >= t,
  );
}

/**
 * Context ids eligible for the model, plus biographical ids unchanged.
 * Used by the Free fixture: the 101st (oldest) message is absent; bio still listed.
 */
export function modelContextFromWindow(input: {
  newestFirst: ChatWindowRow[];
  maxMessages: number;
  biographical: { id: string }[];
}): { contextIds: string[]; biographicalIds: string[] } {
  const window = applyChatMemoryWindow(input.newestFirst, input.maxMessages);
  return {
    contextIds: window.kept.map((m) => m.id),
    biographicalIds: input.biographical.map((b) => b.id),
  };
}
