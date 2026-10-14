import { describe, expect, it, vi } from "vitest";
import { ConversationalMemoryWriter } from "./conversational-memory-writer";
import type { MemoryRepository } from "./memory.repository";

describe("ConversationalMemoryWriter (3.10)", () => {
  it("writes preference and is invisible to biographical search path", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const repo = {
      searchConversational: vi.fn(async () => []),
      searchBiographical: vi.fn(async () => []),
      insertConversational: vi.fn(async (input: Record<string, unknown>) => {
        inserted.push(input);
        return "mem-conv-1";
      }),
      insertBiographical: vi.fn(async () => {
        throw new Error("must never write biographical from chat writer");
      }),
    } as unknown as MemoryRepository;

    const writer = new ConversationalMemoryWriter(repo);
    const ids = await writer.maybeWrite({
      personaId: "p1",
      conversationSessionId: "sess-1",
      userMessage: "Call me Raju please",
    });

    expect(ids).toEqual(["mem-conv-1"]);
    expect(repo.insertConversational).toHaveBeenCalledTimes(1);
    expect(repo.insertBiographical).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({
      memoryType: "session_preference",
      conversationSessionId: "sess-1",
    });
    expect(String(inserted[0]!.text)).not.toMatch(/attended|life event/i);

    // Acceptance: biographical search API is never used for writes; domain stays conversational.
    const bio = await repo.searchBiographical("p1");
    expect(bio).toEqual([]);
  });

  it("skips duplicate canonical text in the same session", async () => {
    const repo = {
      searchConversational: vi.fn(async () => [
        {
          id: "old",
          text: 'User prefers to be called "Raju".',
        },
      ]),
      insertConversational: vi.fn(async () => "new"),
      insertBiographical: vi.fn(),
    } as unknown as MemoryRepository;

    const writer = new ConversationalMemoryWriter(repo);
    const ids = await writer.maybeWrite({
      personaId: "p1",
      conversationSessionId: "sess-1",
      userMessage: "Call me Raju",
    });
    expect(ids).toEqual([]);
    expect(repo.insertConversational).not.toHaveBeenCalled();
  });
});
