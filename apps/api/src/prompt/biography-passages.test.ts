import { describe, expect, it } from "vitest";
import { selectBiographyPassages } from "./biography-passages";

describe("biography passages", () => {
  it("pulls Sidr/father paragraph past a long prefix", () => {
    const bio = [
      "Chapter 1 about childhood hardship and moving cities.\n\n",
      "More filler about school and work. ".repeat(40),
      "\n\nShe also described a particularly traumatic experience involving her father during the period of Cyclone Sidr in 2007.\n\n",
      "Later she admired her mother. Ajin was strongly attached to her mother.",
    ].join("");
    const hits = selectBiographyPassages(
      bio,
      "Ajin 2007 er raat a ki hoyesilo?",
      { downweightNames: ["Ajin"] },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(" ")).toMatch(/Sidr/i);
    expect(hits.join(" ")).toMatch(/father/i);
  });


  it("returns empty when query has no overlap", () => {
    const hits = selectBiographyPassages(
      "Grew up in Dhaka with a dry sense of humor.",
      "quantum cryptography",
    );
    expect(hits).toEqual([]);
  });
});
