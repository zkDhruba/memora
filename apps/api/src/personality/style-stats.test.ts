import { describe, expect, it } from "vitest";
import { computeStyleStats, styleStatsToTraitDrafts } from "./style-stats";

describe("style stats (3.3)", () => {
  it("computes median length and phrase repeats", () => {
    const stats = computeStyleStats([
      { id: "1", body: "kiwi tea please", isThreadFirst: true },
      { id: "2", body: "kiwi tea again" },
      { id: "3", body: "ok bye", isThreadLast: true },
      { id: "4", body: "kiwi tea tomorrow?" },
    ]);
    expect(stats.messageCount).toBe(4);
    expect(stats.medianChars).toBeGreaterThan(0);
    expect(stats.questionMarkRate).toBe(0.25);
    expect(stats.topPhrases.some((p) => p.phrase === "kiwi tea")).toBe(true);
    expect(stats.limitedEvidence).toBe(true);
  });

  it("emits lexicon drafts grounded in phrases", () => {
    const stats = computeStyleStats([
      { id: "1", body: "good morning friend" },
      { id: "2", body: "good morning again" },
      { id: "3", body: "good morning friend" },
    ]);
    const drafts = styleStatsToTraitDrafts(stats);
    expect(drafts.some((d) => d.facet === "lexicon")).toBe(true);
    expect(drafts.every((d) => d.quote.length >= 2)).toBe(true);
  });
});
