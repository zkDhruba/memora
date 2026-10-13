import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, PLAN_IDS } from "./plans";

describe("PLAN_CATALOG", () => {
  it("includes every plan id exactly once", () => {
    expect(PLAN_CATALOG.map((p) => p.id).sort()).toEqual([...PLAN_IDS].sort());
  });

  it("enforces Free < Pro < Pro+ owned persona caps", () => {
    const byId = Object.fromEntries(PLAN_CATALOG.map((p) => [p.id, p]));
    expect(byId.free?.limits.maxOwnedPersonas).toBe(1);
    expect(byId.pro?.limits.maxOwnedPersonas).toBe(5);
    expect(byId.pro_plus?.limits.maxOwnedPersonas).toBe(20);
  });

  it("uses null daily send cap only on Pro+", () => {
    const byId = Object.fromEntries(PLAN_CATALOG.map((p) => [p.id, p]));
    expect(byId.free?.limits.maxChatMessagesPerDay).toBe(25);
    expect(byId.pro?.limits.maxChatMessagesPerDay).toBe(100);
    expect(byId.pro_plus?.limits.maxChatMessagesPerDay).toBeNull();
  });
});
