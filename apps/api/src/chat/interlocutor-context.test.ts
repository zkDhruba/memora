import { describe, expect, it } from "vitest";
import { buildRelationshipCard } from "./interlocutor-context";

describe("interlocutor context", () => {
  it("names the WhatsApp other participant for private chat", () => {
    const card = buildRelationshipCard({
      userDisplayName: "Dhruba",
      importCounterparties: ["Dhruba"],
    });
    expect(card.label).toContain("Dhruba");
    expect(card.note).toMatch(/chinte parso/i);
    expect(card.note).toMatch(/Do not say you recognize them but remember nothing/i);
  });

  it("falls back when no names are known", () => {
    const card = buildRelationshipCard({
      userDisplayName: null,
      importCounterparties: [],
    });
    expect(card.label).toBe("private chat");
    expect(card.note).toMatch(/persona owner/i);
  });
});
