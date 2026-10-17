/**
 * 3.8 — Abort mid-stream still leaves a terminal assistant row (not stuck streaming).
 */
import { describe, expect, it, vi } from "vitest";
import { FakeLlmAdapter } from "../llm/fake-llm.adapter";
import { ChatService } from "./chat.service";
import type { SseWriter } from "./sse";

describe("chat persistence on disconnect (3.8)", () => {
  it("finalizes assistant row as aborted with partial text", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: unknown[] = [];

    const db = {
      insert: vi.fn(() => ({
        values: async (v: unknown) => {
          inserts.push(v);
        },
      })),
      update: vi.fn(() => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            updates.push(patch);
          },
        }),
      })),
      query: {
        conversationSessions: {
          findFirst: async () => ({
            id: "sess",
            personaId: "persona",
            userId: "user",
            summary: null,
            deletedAt: null,
          }),
        },
        conversationMessages: {
          findMany: async () => [],
        },
        consents: {
          findFirst: async () => ({ id: "c1" }),
        },
        personalityProfiles: {
          findFirst: async () => null,
        },
        personalityTraits: {
          findMany: async () => [],
        },
        personalityEvidence: {
          findMany: async () => [],
        },
        users: {
          findFirst: async () => ({
            id: "user",
            displayName: "Tester",
          }),
        },
        sourceParticipants: {
          findMany: async () => [],
        },
        messageCitations: {
          findMany: async () => [],
        },
        documentChunks: {
          findMany: async () => [],
        },
        memories: {
          findMany: async () => [],
        },
      },
      select: vi.fn(() => {
        const rows: unknown[] = [];
        const chain: {
          from: () => typeof chain;
          innerJoin: () => typeof chain;
          where: () => typeof chain;
          orderBy: () => typeof chain;
          limit: () => Promise<unknown[]>;
          then: Promise<unknown[]>["then"];
        } = {
          from: () => chain,
          innerJoin: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: async () => rows,
          then: (onFulfilled, onRejected) =>
            Promise.resolve(rows).then(onFulfilled, onRejected),
        };
        return chain;
      }),
      delete: vi.fn(() => ({ where: async () => undefined })),
    };

    const access = {
      requireMember: async () => ({
        persona: {
          id: "persona",
          displayName: "Test",
          languages: ["en"],
          scenario: "living",
          status: "collecting",
          deletedAt: null,
          providerKey: "openrouter",
        },
        membership: { audience: "private", role: "owner" },
      }),
    };

    const prompts = {
      retrievalQuery: (t: string) => t,
      build: () => ({
        messages: [{ role: "user" as const, content: "hi" }],
        citationMap: {},
        memoryMap: {},
        disclosurePresent: true,
        templateVersion: "chat.v1",
      }),
    };

    const retrieval = {
      retrieve: async () => ({ chunks: [], memories: [] }),
    };

    const fake = new FakeLlmAdapter({
      assertCanCallProvider: async () => undefined,
    } as never);
    fake.replyText = "ABCDEFGHIJ";
    fake.streamDelayMs = 30;

    const audit = { record: async () => undefined };

    const memoryRepo = {
      searchConversational: async () => [],
    };
    const conversationalWriter = {
      maybeWrite: async () => [],
    };
    const plans = {
      getSnapshot: async () => ({ maxChatMemoryMessages: 100 }),
      recordChatSend: async () => 1,
    };

    const chat = new ChatService(
      db as never,
      access as never,
      prompts as never,
      retrieval as never,
      fake,
      audit as never,
      memoryRepo as never,
      conversationalWriter as never,
      plans as never,
    );

    const events: Array<{ event: string; data: unknown }> = [];
    const sse: SseWriter = {
      send: (event, data) => events.push({ event, data }),
      comment: () => undefined,
      end: () => undefined,
    };

    const ac = new AbortController();
    const run = chat.streamMessage(
      "user",
      "persona",
      "sess",
      { text: "hello there" },
      sse,
      ac.signal,
    );

    await new Promise((r) => setTimeout(r, 80));
    ac.abort();
    await run;

    const final = updates.find(
      (u) => u.status === "aborted" || u.status === "complete",
    );
    expect(final).toBeTruthy();
    expect(final!.status).toBe("aborted");
    expect(String(final!.content).length).toBeGreaterThan(0);
    expect(String(final!.content).length).toBeLessThan(fake.replyText.length);
    expect(events.some((e) => e.event === "done" || e.event === "error")).toBe(
      true,
    );
  });
});
