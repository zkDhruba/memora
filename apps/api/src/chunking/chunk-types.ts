export type ChunkSpeakerRole = "subject" | "other" | "unknown" | "document";
export type ChunkSourceKind =
  | "chat"
  | "journal"
  | "prose"
  | "owner_note"
  | "email";

export type DraftChunk = {
  sourceKind: ChunkSourceKind;
  header: string;
  /** Citation body — no synthetic header. */
  content: string;
  speakerRole: ChunkSpeakerRole;
  retrievalAllowed: boolean;
  timeStart: Date | null;
  timeEnd: Date | null;
  messageStart: number | null;
  messageEnd: number | null;
  tokenCount: number;
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Full text passed to the embedder later (header + body). */
export function embeddingText(chunk: DraftChunk): string {
  return chunk.header
    ? `${chunk.header}\n${chunk.content}`
    : chunk.content;
}
