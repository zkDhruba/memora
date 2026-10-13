import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { looksLikeWhatsApp, WhatsAppParser } from "./whatsapp.parser";

const fixtures = join(__dirname, "../../fixtures");

describe("WhatsAppParser", () => {
  const parser = new WhatsAppParser();

  it("parses bracketed (iOS-style) fixture", () => {
    const text = readFileSync(join(fixtures, "whatsapp-bracketed.txt"), "utf8");
    expect(looksLikeWhatsApp("_chat.txt", text)).toBe(true);
    const out = parser.parse(text, { filename: "_chat.txt" });
    expect(out.dateStyle).toBe("bracketed");
    expect(out.participants).toEqual(["Alice", "Bob"]);
    expect(out.speechCount).toBeGreaterThanOrEqual(3);
    const speech = out.messages.filter((m) => m.kind === "speech");
    expect(speech[0]?.rawLabel).toBe("Alice");
    expect(speech[0]?.body).toContain("Good morning");
    expect(speech.some((m) => m.body.includes("coffee"))).toBe(true);
    const systems = out.messages.filter((m) => m.kind === "system");
    expect(systems.some((m) => /media omitted/i.test(m.body))).toBe(true);
  });

  it("parses dashed (Android-style) fixture with continuations", () => {
    const text = readFileSync(join(fixtures, "whatsapp-dashed.txt"), "utf8");
    expect(looksLikeWhatsApp("export.txt", text)).toBe(true);
    const out = parser.parse(text, { filename: "export.txt" });
    expect(out.dateStyle).toBe("dashed");
    expect(out.participants).toEqual(["Alice", "Bob"]);
    const alice = out.messages.find(
      (m) => m.kind === "speech" && m.body.includes("Will do"),
    );
    expect(alice?.body).toContain("bring the book");
  });

  it("rejects non-chat text", () => {
    expect(looksLikeWhatsApp("notes.txt", "Just a journal entry.\n")).toBe(
      false,
    );
  });
});
