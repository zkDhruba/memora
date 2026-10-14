import { describe, expect, it } from "vitest";
import {
  expandQueryForRetrieval,
  expandToken,
  keywordSearchTokens,
  scorePassageOverlap,
} from "./query-expand";

describe("query expand", () => {
  it("maps Sidr to Sidor", () => {
    expect(expandToken("sidr")).toContain("sidor");
    const q = expandQueryForRetrieval("That sidr night in 2007");
    expect(q.toLowerCase()).toContain("sidor");
    const kw = keywordSearchTokens("Ajin 2007 er raat Sidr");
    expect(kw).toEqual(expect.arrayContaining(["2007", "sidr", "sidor"]));
    expect(kw).not.toContain("night");
    expect(kw).not.toContain("rat");
  });


  it("scores Sidr/2007 passage above Ajin-name noise", () => {
    const sidr =
      "She also described a particularly traumatic experience involving her father during the period of Cyclone Sidr in 2007.";
    const mother =
      "As a little girl, Ajin was strongly attached to her mother until Class Four.";
    const q = "Ajin 2007 er raat a ki hoyesilo?";
    const a = scorePassageOverlap(sidr, q, { downweightNames: ["Ajin"] });
    const b = scorePassageOverlap(mother, q, { downweightNames: ["Ajin"] });
    expect(a).toBeGreaterThan(b);
  });

  it("matches Sidor chat line from Sidr query", () => {
    const chat =
      "Ami amr jonmo data bap er thakeo nirjatito hoychi\n2007 e\nSidor er rat e";
    const score = scorePassageOverlap(chat, "Sidr er raat baba", {
      downweightNames: ["Ajin"],
    });
    expect(score).toBeGreaterThan(3);
  });
});
