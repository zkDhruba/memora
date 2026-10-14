import { describe, expect, it } from "vitest";
import {
  collectVoiceSamples,
  inferChatLanguages,
  isNoisyStyleTrait,
  linesFromChunk,
} from "./voice-samples";

describe("voice samples", () => {
  it("filters lexicon trait noise", () => {
    expect(isNoisyStyleTrait('Often uses “ki koro”')).toBe(true);
    expect(isNoisyStyleTrait("Greeting candidate: Hm")).toBe(true);
    expect(isNoisyStyleTrait("self-deprecation")).toBe(false);
  });

  it("extracts short chat lines from chunks", () => {
    const lines = linesFromChunk("Na\nPuran dhaka\nEka\nPathao\nnull\n👍");
    expect(lines).toEqual(["Na", "Puran dhaka", "Eka"]);
  });

  it("collects unique voice samples and infers bn", () => {
    const samples = collectVoiceSamples(
      [
        { content: "Tension niona\nAmi tmr life thake biday hobo" },
        { content: "Ki koro\nBhalo" },
      ],
      5,
    );
    expect(samples.length).toBeGreaterThan(2);
    expect(inferChatLanguages(["en"], samples)).toEqual(["bn", "en"]);
  });
});
