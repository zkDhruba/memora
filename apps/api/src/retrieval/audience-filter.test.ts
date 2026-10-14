import { describe, expect, it } from "vitest";
import {
  audienceAllows,
  visibleContentAudiences,
} from "./audience-filter";

describe("audience filter (3.6)", () => {
  it("private member sees all content tiers", () => {
    expect(audienceAllows("private", "private")).toBe(true);
    expect(audienceAllows("private", "family")).toBe(true);
    expect(audienceAllows("private", "any")).toBe(true);
  });

  it("friend cannot see private or family content", () => {
    expect(audienceAllows("friend", "private")).toBe(false);
    expect(audienceAllows("friend", "family")).toBe(false);
    expect(audienceAllows("friend", "friend")).toBe(true);
    expect(audienceAllows("friend", "any")).toBe(true);
  });

  it("visibleContentAudiences matches allow rules", () => {
    expect(visibleContentAudiences("colleague")).toEqual([
      "colleague",
      "any",
    ]);
    expect(visibleContentAudiences("any")).toEqual(["any"]);
  });
});
