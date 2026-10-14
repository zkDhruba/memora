import { Injectable, Logger } from "@nestjs/common";
import { MemoryRepository } from "./memory.repository";
import {
  extractConversationalCandidates,
  normalizeMemoryText,
} from "./conversational-extract";

export type WriteConversationalInput = {
  personaId: string;
  conversationSessionId: string;
  userMessage: string;
};

/**
 * 3.10 — After a chat turn, persist session_fact / session_preference rows.
 * Never writes biographical memories (docs/08).
 */
@Injectable()
export class ConversationalMemoryWriter {
  private readonly log = new Logger(ConversationalMemoryWriter.name);

  constructor(private readonly memories: MemoryRepository) {}

  /**
   * Extract + insert new conversational memories for this session.
   * Idempotent within a session (skips duplicate canonical text).
   * Returns inserted memory ids.
   */
  async maybeWrite(input: WriteConversationalInput): Promise<string[]> {
    const candidates = extractConversationalCandidates(input.userMessage);
    if (candidates.length === 0) return [];

    const existing = await this.memories.searchConversational(
      input.personaId,
      input.conversationSessionId,
      { limit: 80 },
    );
    const existingNorm = new Set(
      existing.map((m) => normalizeMemoryText(m.text)),
    );

    const inserted: string[] = [];
    for (const c of candidates) {
      const norm = normalizeMemoryText(c.text);
      if (existingNorm.has(norm)) continue;
      try {
        const id = await this.memories.insertConversational({
          personaId: input.personaId,
          conversationSessionId: input.conversationSessionId,
          memoryType: c.memoryType,
          text: c.text,
          confidence: 0.85,
          evidence: { quote: c.quote },
        });
        existingNorm.add(norm);
        inserted.push(id);
      } catch (err) {
        this.log.warn(
          `conversational write skipped: ${(err as Error).message}`,
        );
      }
    }
    return inserted;
  }
}
