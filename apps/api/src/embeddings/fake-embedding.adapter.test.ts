import { describe, expect, it, vi } from "vitest";
import { FakeEmbeddingAdapter } from "./fake-embedding.adapter";

describe("FakeEmbeddingAdapter (3.2)", () => {
  it("returns deterministic same-length vectors after consent", async () => {
    const consent = {
      assertCanCallProvider: vi.fn(async () => undefined),
    };
    const fake = new FakeEmbeddingAdapter(consent as never);
    const a = await fake.embed({
      personaId: "p1",
      texts: ["tea cups", "bicycle chains"],
    });
    expect(consent.assertCanCallProvider).toHaveBeenCalled();
    expect(a.vectors).toHaveLength(2);
    expect(a.vectors[0]).toHaveLength(1536);
    expect(a.vectors[1]).toHaveLength(1536);
    const again = await fake.embed({
      personaId: "p1",
      texts: ["tea cups"],
    });
    expect(again.vectors[0]).toEqual(a.vectors[0]);
  });
});
