import { describe, expect, it } from "vitest";
import { estimateTokens } from "./estimate-tokens";
import { buildChatPrompt, buildRetrievalQuery } from "./prompt-builder";
import { DISCLOSURE_SENTENCE } from "./stable-instructions";
import { TOKEN_BUDGET } from "./token-budget";

describe("prompt builder (3.7)", () => {
  it("keeps disclosure when retrieval overflows source budget", () => {
    const big = "passage ".repeat(800); // ~1400 tokens each
    const chunks = Array.from({ length: 8 }, (_, i) => ({
      chunkId: `chunk-${i}`,
      content: `${big} score-${i}`,
      sourceKind: "journal",
      speakerRole: "document",
      score: i / 10,
    }));

    const built = buildChatPrompt({
      displayName: "Persephone",
      languages: ["en", "bn"],
      scenario: "living",
      styleCard: { humor: { note: "dry", class: "C" } },
      boundaries: ["Do not discuss health details."],
      chunks,
      memories: [],
      userMessage: "What did she collect?",
    });

    expect(built.disclosurePresent).toBe(true);
    expect(built.systemPrompt).toContain(DISCLOSURE_SENTENCE);
    expect(built.systemPrompt).toContain("Do not discuss health details.");
    expect(built.tokens.retrievedSources).toBeLessThanOrEqual(
      TOKEN_BUDGET.retrievedSources,
    );
    // Lowest scores dropped first
    expect(built.trimmed.droppedChunkIds.length).toBeGreaterThan(0);
    expect(built.trimmed.droppedChunkIds).toContain("chunk-0");
    // Highest score kept
    expect(Object.values(built.citationMap)).toContain("chunk-7");
  });

  it("maps dense citation markers after trim", () => {
    const built = buildChatPrompt({
      displayName: "A",
      languages: ["en"],
      scenario: "living",
      styleCard: {},
      chunks: [
        {
          chunkId: "uuid-a",
          content: "tea cups",
          sourceKind: "journal",
          speakerRole: "document",
          score: 0.2,
        },
        {
          chunkId: "uuid-b",
          content: "bicycle chains",
          sourceKind: "journal",
          speakerRole: "document",
          score: 0.9,
        },
      ],
      memories: [
        { memoryId: "mem-1", text: "Liked cricket", score: 0.8 },
      ],
      userMessage: "hobbies?",
    });

    expect(built.citationMap.c1).toBeTruthy();
    expect(built.systemPrompt).toContain('id="c1"');
    expect(built.memoryMap.m1).toBe("mem-1");
    expect(built.systemPrompt).toContain("<source");
    expect(built.templateVersion).toBe("chat.v1");
  });

  it("appends previous user turn when message is under 12 tokens", () => {
    const short = "and then?";
    expect(estimateTokens(short)).toBeLessThan(12);
    const q = buildRetrievalQuery(short, "Tell me about Kyoto teacups");
    expect(q).toContain("Kyoto teacups");
    expect(q).toContain("and then?");
  });

  it("does not append previous turn for long messages", () => {
    const long = "word ".repeat(40);
    expect(estimateTokens(long)).toBeGreaterThanOrEqual(12);
    const q = buildRetrievalQuery(long, "ignored previous");
    expect(q).toBe(long.trim());
    expect(q).not.toContain("ignored");
  });

  it("never drops boundaries to make room for a huge relationship note", () => {
    const built = buildChatPrompt({
      displayName: "A",
      languages: ["en"],
      scenario: "legacy",
      styleCard: {},
      relationship: {
        label: "friend",
        note: "note ".repeat(500),
      },
      boundaries: ["BOUNDARY_SENTINEL_NEVER_DROP"],
      chunks: [],
      memories: [],
      userMessage: "hi",
    });
    expect(built.systemPrompt).toContain("BOUNDARY_SENTINEL_NEVER_DROP");
    expect(built.disclosurePresent).toBe(true);
    expect(built.tokens.relationshipAndBoundaries).toBeLessThanOrEqual(
      TOKEN_BUDGET.relationshipAndBoundaries,
    );
  });
});
