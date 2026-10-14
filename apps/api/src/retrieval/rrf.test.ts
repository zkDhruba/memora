import { describe, expect, it } from "vitest";
import { RRF_K, reciprocalRankFusion, rrfTopIds } from "./rrf";

describe("reciprocal rank fusion (3.6)", () => {
  it("sums 1/(k+rank) across lists", () => {
    const scores = reciprocalRankFusion([
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
      ],
      [
        { id: "b", rank: 1 },
        { id: "c", rank: 2 },
      ],
    ]);
    expect(scores.get("a")).toBeCloseTo(1 / (RRF_K + 1));
    expect(scores.get("b")).toBeCloseTo(
      1 / (RRF_K + 2) + 1 / (RRF_K + 1),
    );
    expect(scores.get("c")).toBeCloseTo(1 / (RRF_K + 2));
  });

  it("prefers items that rank well in both channels", () => {
    const top = rrfTopIds(
      [
        [
          { id: "tea", rank: 1 },
          { id: "bike", rank: 2 },
        ],
        [
          { id: "tea", rank: 1 },
          { id: "bike", rank: 3 },
        ],
      ],
      2,
    );
    expect(top[0]?.id).toBe("tea");
  });
});
