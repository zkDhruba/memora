import { describe, expect, it } from "vitest";
import { estimateTokens } from "./estimate-tokens";
import { TOKEN_BUDGET } from "./token-budget";
import {
  trimScoredToBudget,
  trimTurnsToBudget,
  truncateToTokens,
} from "./token-trimmer";

describe("token trimmer (3.7)", () => {
  it("drops lowest-scoring passages first when over budget", () => {
    const filler = "word ".repeat(200); // ~250 tokens each
    const items = [
      { id: "low", text: `LOW ${filler}`, score: 0.1 },
      { id: "high", text: `HIGH ${filler}`, score: 0.9 },
      { id: "mid", text: `MID ${filler}`, score: 0.5 },
    ];
    const budget = estimateTokens(items[0]!.text) + 10;
    const result = trimScoredToBudget(items, budget);
    expect(result.kept.map((k) => k.id)).toEqual(["high"]);
    expect(result.droppedIds.sort()).toEqual(["low", "mid"]);
  });

  it("drops oldest turns first", () => {
    const turns = [
      { role: "user" as const, content: "one ".repeat(100) },
      { role: "assistant" as const, content: "two ".repeat(100) },
      { role: "user" as const, content: "three ".repeat(100) },
    ];
    // Budget fits only the newest turn.
    const lastCost = estimateTokens(turns[2]!.content);
    const result = trimTurnsToBudget(turns, lastCost + 5);
    expect(result.droppedCount).toBe(2);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.content.startsWith("three")).toBe(true);
  });

  it("truncateToTokens respects budget", () => {
    const text = "abcdefghij".repeat(40);
    const out = truncateToTokens(text, 10);
    expect(estimateTokens(out)).toBeLessThanOrEqual(10);
  });

  it("source budget constant matches docs/06", () => {
    expect(TOKEN_BUDGET.retrievedSources).toBe(4_000);
    expect(TOKEN_BUDGET.biographicalMemories).toBe(1_200);
  });
});
