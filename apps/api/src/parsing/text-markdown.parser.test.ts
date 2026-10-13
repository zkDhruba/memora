import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TextMarkdownParser,
  TextParseError,
  decodeUtf8Text,
  findDocumentDate,
  kindFromUpload,
} from "./text-markdown.parser";

const fixtures = join(__dirname, "../../fixtures");

describe("TextMarkdownParser", () => {
  const parser = new TextMarkdownParser();

  it("parses plain text fixture (BOM + CRLF)", () => {
    const buf = readFileSync(join(fixtures, "plain.txt"));
    const out = parser.parse(buf, {
      mediaType: "text/plain",
      filename: "plain.txt",
    });
    expect(out.kind).toBe("plain_text");
    expect(out.text).toContain("Memora plain-text fixture");
    expect(out.text).not.toMatch(/\r/);
    expect(out.documentDate).toBe("2024-06-15");
    expect(out.storeInline).toBe(true);
    expect(out.charCount).toBeGreaterThan(20);
  });

  it("parses markdown fixture", () => {
    const buf = readFileSync(join(fixtures, "notes.md"));
    const out = parser.parse(buf, {
      mediaType: "text/markdown",
      filename: "notes.md",
    });
    expect(out.kind).toBe("markdown");
    expect(out.text).toContain("# Journal notes");
    expect(out.text).toContain("**bold**");
    expect(out.documentDate).toBe("2024-03-01T10:00:00Z");
  });

  it("rejects empty and binary", () => {
    expect(() => decodeUtf8Text(Buffer.from(""))).toThrow(TextParseError);
    expect(() => decodeUtf8Text(Buffer.from([0x00, 0x01, 0x02]))).toThrow(
      TextParseError,
    );
    expect(() =>
      parser.parse(Buffer.from("   \n\t  "), {
        mediaType: "text/plain",
        filename: "empty.txt",
      }),
    ).toThrow(/no non-whitespace/);
  });

  it("kindFromUpload maps md extension even with text/plain", () => {
    expect(kindFromUpload("text/plain", "diary.md")).toBe("markdown");
    expect(kindFromUpload("text/plain", "diary.txt")).toBe("plain_text");
    expect(kindFromUpload("application/pdf", "x.pdf")).toBeNull();
  });

  it("findDocumentDate reads first ISO date", () => {
    expect(findDocumentDate("Written on 2023-12-25 about home.")).toBe(
      "2023-12-25",
    );
    expect(findDocumentDate("no dates here")).toBeNull();
  });
});
