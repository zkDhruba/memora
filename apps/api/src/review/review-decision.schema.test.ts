import { describe, expect, it } from "vitest";
import {
  memoryCorrectBodySchema,
  reviewDecisionBodySchema,
} from "@memora/shared";

describe("reviewDecisionBodySchema", () => {
  it("accepts confirm and reject without value", () => {
    expect(reviewDecisionBodySchema.parse({ action: "confirm" }).action).toBe(
      "confirm",
    );
    expect(reviewDecisionBodySchema.parse({ action: "reject" }).action).toBe(
      "reject",
    );
  });

  it("requires value when action is correct", () => {
    expect(() =>
      reviewDecisionBodySchema.parse({ action: "correct" }),
    ).toThrow();
    expect(
      reviewDecisionBodySchema.parse({
        action: "correct",
        value: "Taught at Dhaka University",
      }).value,
    ).toBe("Taught at Dhaka University");
  });
});

describe("memoryCorrectBodySchema", () => {
  it("requires non-empty text", () => {
    expect(() => memoryCorrectBodySchema.parse({ text: "" })).toThrow();
    expect(memoryCorrectBodySchema.parse({ text: "Liked cricket" }).text).toBe(
      "Liked cricket",
    );
  });
});
