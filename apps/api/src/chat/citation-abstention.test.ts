import { describe, expect, it } from "vitest";
import {
  ABSTENTION_BN,
  ABSTENTION_EN,
  applyCitationAbstention,
  extractMarkers,
  isFactualBiographicalQuery,
  stripMarkers,
} from "./citation-abstention";

describe("citation + abstention (3.9)", () => {
  it("detects factual biographical questions", () => {
    expect(isFactualBiographicalQuery("When was Sidr?")).toBe(true);
    expect(isFactualBiographicalQuery("What about your father?")).toBe(true);
    expect(isFactualBiographicalQuery("2007 er raat a ki hoyesilo?")).toBe(true);
    expect(isFactualBiographicalQuery("কবে জন্ম?")).toBe(true);
    expect(isFactualBiographicalQuery("hi")).toBe(false);
    expect(isFactualBiographicalQuery("ki koro")).toBe(false);
    expect(isFactualBiographicalQuery("Who are you?")).toBe(false);
    expect(isFactualBiographicalQuery("Amk chinte parso?")).toBe(false);
    expect(isFactualBiographicalQuery("What?")).toBe(false);
    expect(isFactualBiographicalQuery("tmra koy bhai bon?")).toBe(true);
    expect(isFactualBiographicalQuery("Lebuwali k?")).toBe(true);
  });

  it("must-abstain: factual question with zero valid markers", () => {
    const result = applyCitationAbstention({
      userMessage: "When was Sidr?",
      reply: "It was a challenging night with much disaster all around.",
      citationMap: { c1: "chunk-sidr" },
      memoryMap: {},
    });
    expect(result.abstained).toBe(true);
    expect(result.citations).toEqual([]);
    expect(result.content).toBe(ABSTENTION_EN);
  });

  it("must-abstain uses Banglish copy for Banglish questions", () => {
    const result = applyCitationAbstention({
      userMessage: "2007 er raat a ki hoyesilo? Sidr",
      reply: "It was a very challenging time with disaster everywhere.",
      citationMap: { c1: "chunk-a" },
      memoryMap: {},
    });
    expect(result.abstained).toBe(true);
    expect(result.content).toBe(ABSTENTION_BN);
  });

  it("keeps a short human soft-deny instead of the template", () => {
    const result = applyCitationAbstention({
      userMessage: "tmra koy bhai bon?",
      reply: "Hmm janina seta",
      citationMap: { c1: "chunk-a" },
      memoryMap: {},
    });
    expect(result.abstained).toBe(true);
    expect(result.content).toBe("Hmm janina seta");
  });

  it("Banglish sibling ask gets Banglish abstention template", () => {
    const result = applyCitationAbstention({
      userMessage: "tmra koy bhai bon?",
      reply: "We are three brothers and two sisters living happily.",
      citationMap: {},
      memoryMap: {},
    });
    expect(result.abstained).toBe(true);
    expect(result.content).toBe(ABSTENTION_BN);
  });

  it("keeps grounded replies and strips markers from content", () => {
    const result = applyCitationAbstention({
      userMessage: "What about your father?",
      reply:
        "Ami amr jonmo data bap er thakeo nirjatito hoychi [[c1]] 2007 e Sidor er rat e.",
      citationMap: { c1: "chunk-sidr" },
      memoryMap: {},
    });
    expect(result.abstained).toBe(false);
    expect(result.citations).toEqual([
      { marker: "c1", kind: "chunk", chunkId: "chunk-sidr" },
    ]);
    expect(result.content).not.toContain("[[c1]]");
    expect(result.content).toContain("nirjatito");
  });

  it("strips unknown markers and ignores them for grounding", () => {
    const result = applyCitationAbstention({
      userMessage: "Where were you born?",
      reply: "Dhaka [[c99]] te [[c1]].",
      citationMap: { c1: "chunk-dhaka" },
      memoryMap: {},
    });
    expect(result.abstained).toBe(false);
    expect(result.unknownMarkers).toEqual(["c99"]);
    expect(result.citations.map((c) => c.marker)).toEqual(["c1"]);
    expect(result.content).not.toContain("[[");
  });

  it("does not abstain on small talk without markers", () => {
    const result = applyCitationAbstention({
      userMessage: "hi",
      reply: "Hm\nKi bolcho",
      citationMap: { c1: "chunk-x" },
      memoryMap: {},
    });
    expect(result.abstained).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it("extractMarkers and stripMarkers are consistent", () => {
    expect(extractMarkers("a [[c1]] b [[m2]]")).toEqual(["c1", "m2"]);
    expect(stripMarkers("a [[c1]] b")).toBe("a  b".replace(/ {2,}/g, " ").trim());
  });
});
