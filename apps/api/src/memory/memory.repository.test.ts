import { describe, expect, it, vi } from "vitest";
import { MemoryDomainError } from "./memory.errors";
import { MemoryRepository } from "./memory.repository";

describe("MemoryRepository domain guard (3.4)", () => {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
    query: {
      memories: { findMany: vi.fn(async () => []) },
    },
  };

  it("rejects conversational session on biographical insert", async () => {
    const repo = new MemoryRepository(db as never);
    await expect(
      repo.insertBiographical({
        personaId: "p1",
        memoryType: "semantic",
        text: "Liked cricket",
        knowledgeClass: "C",
        origin: "extracted",
        conversationSessionId: "sess-1",
        evidence: { quote: "I like cricket" },
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_DOMAIN_VIOLATION",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects extracted biographical without quote", async () => {
    const repo = new MemoryRepository(db as never);
    await expect(
      repo.insertBiographical({
        personaId: "p1",
        memoryType: "episodic",
        text: "Went to Dhaka",
        knowledgeClass: "C",
        origin: "extracted",
      }),
    ).rejects.toBeInstanceOf(MemoryDomainError);
  });

  it("rejects chunk evidence on conversational insert", async () => {
    const repo = new MemoryRepository(db as never);
    await expect(
      repo.insertConversational({
        personaId: "p1",
        conversationSessionId: "sess-1",
        memoryType: "session_fact",
        text: "User mentioned an exam",
        evidence: { quote: "exam", chunkId: "chunk-1" },
      }),
    ).rejects.toMatchObject({
      code: "MEMORY_DOMAIN_VIOLATION",
    });
  });
});
