import { describe, expect, it } from "vitest";
import { filterGroundedTraits, quoteIsGrounded } from "./quote-check";

describe("quote check (3.3)", () => {
  const corpus = "He said আচ্ছা then left.\nShort reply before noon.";

  it("accepts exact substrings", () => {
    expect(quoteIsGrounded("আচ্ছা", corpus)).toBe(true);
    expect(quoteIsGrounded("Short reply before noon.", corpus)).toBe(true);
  });

  it("drops fabricated quotes", () => {
    expect(quoteIsGrounded("I love skydiving on Mars", corpus)).toBe(false);
  });

  it("filters candidate lists", () => {
    const { kept, dropped } = filterGroundedTraits(
      [
        { value: "uses আচ্ছা", quote: "আচ্ছা" },
        { value: "skydives", quote: "I love skydiving on Mars" },
      ],
      corpus,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.quote).toContain("skydiving");
  });
});
