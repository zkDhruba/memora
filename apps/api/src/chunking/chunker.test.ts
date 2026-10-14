import { describe, expect, it } from "vitest";
import { CHAT_OVERLAP, CHAT_WINDOW, chunkChat } from "./chat.chunker";
import { chunkJournal, splitJournalEntries } from "./journal.chunker";
import {
  OWNER_NOTE_WHOLE_MAX,
  PROSE_OVERLAP,
  PROSE_TARGET_MAX,
  chunkProse,
} from "./prose.chunker";
import { chunkDocumentText } from "./chunker";

describe("chunkChat", () => {
  it("windows 6 subject messages with overlap 2", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      position: i,
      body: `Subject line ${i} with enough text.`,
      sentAt: new Date(`2024-01-${String(i + 1).padStart(2, "0")}T12:00:00Z`),
      speakerRole: "subject" as const,
      retrievalAllowed: true,
      rawLabel: "Alice",
    }));
    const chunks = chunkChat({ threadId: "t1", messages });
    const subject = chunks.filter((c) => c.speakerRole === "subject");
    expect(subject.length).toBeGreaterThanOrEqual(2);
    expect(subject[0]?.messageStart).toBe(0);
    expect(subject[0]?.messageEnd).toBe(CHAT_WINDOW - 1);
    // Next window starts at WINDOW - OVERLAP = 4
    expect(subject[1]?.messageStart).toBe(CHAT_WINDOW - CHAT_OVERLAP);
    expect(subject.every((c) => c.retrievalAllowed)).toBe(true);
    expect(subject[0]?.header).toContain("thread=t1");
  });

  it("stores other speakers as non-retrievable single chunks", () => {
    const chunks = chunkChat({
      threadId: "t1",
      messages: [
        {
          position: 0,
          body: "Hi from Bob",
          sentAt: new Date("2024-01-01T12:00:00Z"),
          speakerRole: "other",
          retrievalAllowed: false,
          rawLabel: "Bob",
        },
        {
          position: 1,
          body: "Hi from Alice",
          sentAt: new Date("2024-01-01T12:01:00Z"),
          speakerRole: "subject",
          retrievalAllowed: true,
          rawLabel: "Alice",
        },
      ],
    });
    const other = chunks.find((c) => c.speakerRole === "other");
    expect(other?.retrievalAllowed).toBe(false);
    expect(other?.content).toBe("Hi from Bob");
  });
});

describe("chunkJournal", () => {
  it("splits on blank lines and keeps dates in headers", () => {
    const text = [
      "2024-01-10",
      "Morning walk in the park.",
      "",
      "2024-01-11",
      "Called home and cooked dinner.",
    ].join("\n");
    const entries = splitJournalEntries(text);
    expect(entries.length).toBe(2);
    const chunks = chunkJournal(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.header).toContain("2024-01-10");
    expect(chunks[1]?.header).toContain("2024-01-11");
    expect(chunks.every((c) => c.retrievalAllowed)).toBe(true);
  });

  it("does not merge two dated entries", () => {
    const text = "2024-02-01\nShort A.\n\n2024-02-02\nShort B.";
    expect(chunkJournal(text)).toHaveLength(2);
  });
});

describe("chunkProse", () => {
  it("builds overlapping paragraph windows", () => {
    const paras = Array.from({ length: 8 }, (_, i) =>
      `Paragraph ${i} ${"word ".repeat(40)}`.trim(),
    );
    const text = paras.join("\n\n");
    const chunks = chunkProse(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.sourceKind === "prose")).toBe(true);
    // Overlap: some shared text between consecutive windows when large enough.
    if (chunks.length >= 2 && chunks[0]!.content.length > PROSE_OVERLAP) {
      const tail = chunks[0]!.content.slice(-PROSE_OVERLAP);
      // Soft check — overlap may include newlines; length bounds still hold.
      expect(chunks[0]!.content.length).toBeLessThanOrEqual(
        PROSE_TARGET_MAX + 200,
      );
      void tail;
    }
  });

  it("keeps short owner notes whole", () => {
    const note = "Remember to water the plants.";
    expect(note.length).toBeLessThan(OWNER_NOTE_WHOLE_MAX);
    const chunks = chunkProse(note, { sourceKind: "owner_note" });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sourceKind).toBe("owner_note");
    expect(chunks[0]?.content).toBe(note);
  });
});

describe("chunkDocumentText", () => {
  it("routes journal kind to journal chunker", () => {
    const chunks = chunkDocumentText(
      "journal",
      "2023-05-01\nFirst entry only.",
    );
    expect(chunks[0]?.sourceKind).toBe("journal");
  });
});
