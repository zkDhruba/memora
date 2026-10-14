import { describe, expect, it } from "vitest";
import { extractConversationalCandidates } from "./conversational-extract";

describe("conversational extract (3.10)", () => {
  it("extracts call-me preferences", () => {
    const found = extractConversationalCandidates("Please call me Dhruba");
    expect(found).toHaveLength(1);
    expect(found[0]!.memoryType).toBe("session_preference");
    expect(found[0]!.text).toContain("Dhruba");
  });

  it("extracts Banglish name preference", () => {
    const found = extractConversationalCandidates("Amake Raju dako");
    expect(found.some((c) => c.memoryType === "session_preference")).toBe(
      true,
    );
  });

  it("extracts exam session fact", () => {
    const found = extractConversationalCandidates("I have an exam tomorrow");
    expect(found.some((c) => c.memoryType === "session_fact")).toBe(true);
    expect(found[0]!.text).toMatch(/exam/i);
  });

  it("ignores small talk", () => {
    expect(extractConversationalCandidates("hi")).toEqual([]);
    expect(extractConversationalCandidates("ki koro")).toEqual([]);
    expect(extractConversationalCandidates("tmra koy bhai bon?")).toEqual([]);
  });
});
