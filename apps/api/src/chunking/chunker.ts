import { chunkChat, type ChatMessageForChunk } from "./chat.chunker";
import { chunkJournal } from "./journal.chunker";
import { chunkProse } from "./prose.chunker";
import type { DraftChunk } from "./chunk-types";

export type DocumentKindForChunk =
  | "plain_text"
  | "markdown"
  | "prose"
  | "journal"
  | "biography"
  | "owner_note"
  | "csv_dump";

/** Route document kinds to journal vs prose vs owner-note rules. */
export function chunkDocumentText(
  kind: DocumentKindForChunk,
  text: string,
): DraftChunk[] {
  switch (kind) {
    case "journal":
    case "biography":
      return chunkJournal(text);
    case "owner_note":
      return chunkProse(text, { sourceKind: "owner_note" });
    case "csv_dump":
      // MVP: searchable text dump via prose windows (not row embeddings).
      return chunkProse(text, { sourceKind: "prose" });
    case "plain_text":
    case "markdown":
    case "prose":
    default:
      // Short plain notes under owner-note size stay whole via prose helper
      // when treated as owner_note; generic uploads use prose windows.
      return chunkProse(text, { sourceKind: "prose" });
  }
}

export function chunkChatThread(input: {
  threadId: string;
  counterpartyLabel?: string | null;
  messages: ChatMessageForChunk[];
}): DraftChunk[] {
  return chunkChat(input);
}

export {
  chunkChat,
  chunkJournal,
  chunkProse,
  type ChatMessageForChunk,
  type DraftChunk,
};
