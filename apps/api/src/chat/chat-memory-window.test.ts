import { describe, expect, it } from "vitest";
import {
  applyChatMemoryWindow,
  conversationalInsideWindow,
  modelContextFromWindow,
} from "./chat-memory-window";

function chronological(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    sessionId: i < 40 ? "older-session" : "current",
    role: "user" as const,
    content: `text-${i + 1}`,
    status: "complete",
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
  }));
}

describe("chat memory window (3.10b)", () => {
  it("Free cap 100: message 101 (oldest) is outside model context; biographical memory stays", () => {
    const newestFirst = chronological(101).reverse();
    const bio = [{ id: "bio-cricket", text: "Liked cricket" }];
    const { contextIds, biographicalIds } = modelContextFromWindow({
      newestFirst,
      maxMessages: 100,
      biographical: bio,
    });

    expect(contextIds).toHaveLength(100);
    expect(contextIds).not.toContain("m1");
    expect(contextIds).toContain("m101");
    expect(contextIds).toContain("m2");
    expect(biographicalIds).toEqual(["bio-cricket"]);
  });

  it("drops conversational memories written before the window cutoff", () => {
    const newestFirst = chronological(101).reverse();
    const { kept, cutoff } = applyChatMemoryWindow(newestFirst, 100);
    const sessionIds = new Set(kept.map((m) => m.sessionId));
    const old = chronological(1)[0]!;
    const keptRows = conversationalInsideWindow(
      [
        {
          createdAt: old.createdAt,
          conversationSessionId: "older-session",
          text: "from message 1",
        },
        {
          createdAt: kept[0]!.createdAt,
          conversationSessionId: "current",
          text: "from latest",
        },
      ],
      sessionIds,
      cutoff,
    );
    expect(keptRows.map((r) => r.text)).toEqual(["from latest"]);
  });

  it("system rows do not consume a window slot", () => {
    const rows = [
      {
        id: "new",
        sessionId: "s",
        role: "user",
        content: "new",
        status: "complete",
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        id: "sys",
        sessionId: "s",
        role: "system",
        content: "disclosure",
        status: "complete",
        createdAt: new Date("2026-01-15T00:00:00Z"),
      },
      {
        id: "old",
        sessionId: "s",
        role: "assistant",
        content: "old",
        status: "complete",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    const { kept, droppedIds } = applyChatMemoryWindow(rows, 1);
    expect(kept.map((m) => m.id)).toEqual(["new"]);
    expect(droppedIds).toEqual(["old"]);
  });
});
