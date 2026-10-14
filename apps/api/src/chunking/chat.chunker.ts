import {
  estimateTokens,
  type DraftChunk,
} from "./chunk-types";

/** Subject-side window size and overlap (09-rag-pipeline). */
export const CHAT_WINDOW = 6;
export const CHAT_OVERLAP = 2;
export const CHAT_CHAR_CAP = 1200;

export type ChatMessageForChunk = {
  position: number;
  body: string;
  sentAt: Date | null;
  speakerRole: "subject" | "other" | "unknown";
  retrievalAllowed: boolean;
  rawLabel: string | null;
};

/**
 * Chat rule: windows of 6 subject-side messages, overlap 2, same thread.
 * Do not split a message. Cap 1,200 characters (drop oldest in window if needed).
 * Also emits one chunk per non-subject speech message (stored, not retrievable).
 */
export function chunkChat(input: {
  threadId: string;
  counterpartyLabel?: string | null;
  messages: ChatMessageForChunk[];
}): DraftChunk[] {
  const speech = input.messages.filter((m) => m.body.trim().length > 0);
  const subjectMsgs = speech.filter((m) => m.speakerRole === "subject");
  const otherMsgs = speech.filter((m) => m.speakerRole !== "subject");

  const out: DraftChunk[] = [];

  for (const m of otherMsgs) {
    out.push({
      sourceKind: "chat",
      header: buildChatHeader({
        threadId: input.threadId,
        timeStart: m.sentAt,
        timeEnd: m.sentAt,
        counterparty: m.rawLabel,
        speaker: m.speakerRole,
      }),
      content: m.body.trim(),
      speakerRole: m.speakerRole,
      retrievalAllowed: false,
      timeStart: m.sentAt,
      timeEnd: m.sentAt,
      messageStart: m.position,
      messageEnd: m.position,
      tokenCount: estimateTokens(m.body),
    });
  }

  if (subjectMsgs.length === 0) return out;

  const step = Math.max(1, CHAT_WINDOW - CHAT_OVERLAP);
  for (let start = 0; start < subjectMsgs.length; start += step) {
    let window = subjectMsgs.slice(start, start + CHAT_WINDOW);
    if (window.length === 0) break;

    // Cap: drop from the front until under limit (never split a message).
    while (window.length > 1 && joinedLen(window) > CHAT_CHAR_CAP) {
      window = window.slice(1);
    }
    // Single oversize message: still one chunk (do not split).
    const content = window.map((m) => m.body.trim()).join("\n");
    const timeStart = window[0]?.sentAt ?? null;
    const timeEnd = window[window.length - 1]?.sentAt ?? null;
    const header = buildChatHeader({
      threadId: input.threadId,
      timeStart,
      timeEnd,
      counterparty: input.counterpartyLabel ?? null,
      speaker: "subject",
    });

    out.push({
      sourceKind: "chat",
      header,
      content,
      speakerRole: "subject",
      retrievalAllowed: true,
      timeStart,
      timeEnd,
      messageStart: window[0]!.position,
      messageEnd: window[window.length - 1]!.position,
      tokenCount: estimateTokens(header + content),
    });

    if (start + CHAT_WINDOW >= subjectMsgs.length) break;
  }

  return out;
}

function joinedLen(msgs: ChatMessageForChunk[]): number {
  return msgs.reduce((n, m) => n + m.body.trim().length + 1, 0);
}

function buildChatHeader(input: {
  threadId: string;
  timeStart: Date | null;
  timeEnd: Date | null;
  counterparty: string | null;
  speaker: string;
}): string {
  const span =
    input.timeStart && input.timeEnd
      ? `${input.timeStart.toISOString()}–${input.timeEnd.toISOString()}`
      : input.timeStart?.toISOString() ?? "unknown-time";
  const who = input.counterparty ? ` counterparty=${input.counterparty}` : "";
  return `thread=${input.threadId} time=${span} speaker=${input.speaker}${who}`;
}
