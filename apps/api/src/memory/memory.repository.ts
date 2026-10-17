import { Inject, Injectable } from "@nestjs/common";
import {
  memories,
  memoryEvidence,
  type MemoraDb,
} from "@memora/db";
import { and, eq, gte, inArray, ne } from "drizzle-orm";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";
import { MemoryDomainError } from "./memory.errors";

export type BiographicalMemoryInput = {
  personaId: string;
  memoryType:
    | "semantic"
    | "episodic"
    | "autobiographical"
    | "relationship"
    | "temporal";
  text: string;
  knowledgeClass: "A" | "B" | "C" | "D" | "E";
  confidence?: number;
  audience?: "any" | "family" | "friend" | "colleague" | "private";
  origin: "extracted" | "owner_entered";
  sensitivity?: "none" | "health" | "belief" | "minor" | "financial" | "other";
  timeStart?: Date | null;
  timeEnd?: Date | null;
  timePrecision?: "day" | "month" | "year" | "approximate" | "unknown";
  /** Required for extracted; optional for owner_entered. */
  evidence?: {
    quote: string;
    messageId?: string | null;
    chunkId?: string | null;
  };
  /** Forbidden — conversational must not land here. */
  conversationSessionId?: string | null;
};

export type ConversationalMemoryInput = {
  personaId: string;
  conversationSessionId: string;
  memoryType: "session_fact" | "session_preference";
  text: string;
  confidence?: number;
  /** Must not attach source-file evidence. */
  evidence?: { quote: string; messageId?: string; chunkId?: string };
};

/**
 * Enforces biographical ≠ conversational (docs/08).
 * No searchAllMemories — use searchBiographical / searchConversational.
 */
@Injectable()
export class MemoryRepository {
  constructor(@Inject(DB) private readonly db: MemoraDb) {}

  async insertBiographical(input: BiographicalMemoryInput): Promise<string> {
    if (input.conversationSessionId) {
      throw new MemoryDomainError(
        "MEMORY_DOMAIN_VIOLATION",
        "Conversational insert into biographical fails: conversationSessionId is not allowed on biographical memories.",
      );
    }
    if (
      input.memoryType === ("session_fact" as string) ||
      input.memoryType === ("session_preference" as string)
    ) {
      throw new MemoryDomainError(
        "MEMORY_DOMAIN_VIOLATION",
        "Session memory types cannot be biographical.",
      );
    }
    if (input.origin === "extracted" && !input.evidence?.quote) {
      throw new MemoryDomainError(
        "MEMORY_EVIDENCE_REQUIRED",
        "Extracted biographical memories require a grounded quote.",
      );
    }

    const id = newId();
    const audience =
      input.sensitivity && input.sensitivity !== "none"
        ? "private"
        : (input.audience ?? "private");

    await this.db.insert(memories).values({
      id,
      personaId: input.personaId,
      domain: "biographical",
      memoryType: input.memoryType,
      text: input.text,
      timeStart: input.timeStart ?? null,
      timeEnd: input.timeEnd ?? null,
      timePrecision: input.timePrecision ?? "unknown",
      status: "pending_review",
      knowledgeClass: input.knowledgeClass,
      confidence: input.confidence ?? 0.5,
      audience,
      origin: input.origin,
      sensitivity: input.sensitivity ?? "none",
      conversationSessionId: null,
    });

    if (input.evidence?.quote) {
      await this.db.insert(memoryEvidence).values({
        id: newId(),
        memoryId: id,
        messageId: input.evidence.messageId ?? null,
        chunkId: input.evidence.chunkId ?? null,
        quote: input.evidence.quote.slice(0, 280),
      });
    }

    return id;
  }

  async insertConversational(
    input: ConversationalMemoryInput,
  ): Promise<string> {
    if (!input.conversationSessionId) {
      throw new MemoryDomainError(
        "MEMORY_DOMAIN_VIOLATION",
        "Conversational memories require conversationSessionId.",
      );
    }
    if (input.evidence?.chunkId) {
      throw new MemoryDomainError(
        "MEMORY_DOMAIN_VIOLATION",
        "Conversational memories must not attach source-file (chunk) evidence.",
      );
    }

    const id = newId();
    await this.db.insert(memories).values({
      id,
      personaId: input.personaId,
      domain: "conversational",
      memoryType: input.memoryType,
      text: input.text,
      status: "confirmed",
      knowledgeClass: "D",
      confidence: input.confidence ?? 0.8,
      audience: "private",
      origin: "conversation",
      sensitivity: "none",
      conversationSessionId: input.conversationSessionId,
    });

    if (input.evidence?.quote) {
      await this.db.insert(memoryEvidence).values({
        id: newId(),
        memoryId: id,
        messageId: input.evidence.messageId ?? null,
        chunkId: null,
        quote: input.evidence.quote.slice(0, 280),
      });
    }

    return id;
  }

  /** Biographical retrieval only — never returns conversational rows. */
  async searchBiographical(personaId: string, opts?: { limit?: number }) {
    return this.db.query.memories.findMany({
      where: and(
        eq(memories.personaId, personaId),
        eq(memories.domain, "biographical"),
        eq(memories.status, "confirmed"),
      ),
      limit: opts?.limit ?? 50,
    });
  }

  /**
   * Conversational retrieval only — one session or several inside the plan window.
   * `notBefore` drops rows written before the chat-memory cutoff (3.10b).
   * Never returns biographical rows.
   */
  async searchConversational(
    personaId: string,
    sessionId: string | string[],
    opts?: { limit?: number; notBefore?: Date },
  ) {
    const sessionIds = (Array.isArray(sessionId) ? sessionId : [sessionId]).filter(
      Boolean,
    );
    if (sessionIds.length === 0) return [];
    return this.db.query.memories.findMany({
      where: and(
        eq(memories.personaId, personaId),
        eq(memories.domain, "conversational"),
        inArray(memories.conversationSessionId, sessionIds),
        ne(memories.status, "rejected"),
        ne(memories.status, "retracted"),
        opts?.notBefore ? gte(memories.createdAt, opts.notBefore) : undefined,
      ),
      limit: opts?.limit ?? 50,
    });
  }
}
