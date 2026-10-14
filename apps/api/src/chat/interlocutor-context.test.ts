import { describe, expect, it } from "vitest";
import { buildRelationshipCard } from "./interlocutor-context";

describe("interlocutor context", () => {
  it("names the WhatsApp other participant for private chat", () => {
    const card = buildRelationshipCard({
      userDisplayName: "Dhruba",
      importCounterparties: ["Dhruba"],
    });
    expect(card.label).toBe("Dhruba");
    expect(card.note).toMatch(/Their name is Dhruba/i);
    expect(card.note).toMatch(/Never explain this card/i);
  });

  it("falls back when no names are known", () => {
    const card = buildRelationshipCard({
      userDisplayName: null,
      importCounterparties: [],
    });
    expect(card.label).toBe("private owner chat");
    expect(card.note).toMatch(/owner/i);
  });
});
