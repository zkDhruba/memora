import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocxParser } from "./docx.parser";
import { PdfParser } from "./pdf.parser";
import { DocumentParseError, formatFromUpload } from "./parse-result";

const fixtures = join(__dirname, "../../fixtures");

describe("DocxParser", () => {
  const parser = new DocxParser();

  it("parses sample.docx to markdown", async () => {
    const buf = readFileSync(join(fixtures, "sample.docx"));
    const out = await parser.parse(buf);
    expect(out.kind).toBe("markdown");
    expect(out.text).toContain("Memora DOCX fixture");
    expect(out.documentDate).toBe("2024-08-20");
    expect(out.storeInline).toBe(true);
    expect(out.meta?.source).toBe("docx");
  });

  it("rejects empty buffer", async () => {
    await expect(parser.parse(Buffer.alloc(0))).rejects.toBeInstanceOf(
      DocumentParseError,
    );
  });
});

describe("PdfParser", () => {
  const parser = new PdfParser();

  it("parses digital.pdf to prose", async () => {
    const buf = readFileSync(join(fixtures, "digital.pdf"));
    const out = await parser.parse(buf);
    expect(out.kind).toBe("prose");
    expect(out.text).toContain("Memora digital PDF");
    expect(out.documentDate).toBe("2024-09-01");
    expect(out.meta?.totalPages).toBe(1);
  });

  it("marks scanned.pdf as NEEDS_OCR", async () => {
    const buf = readFileSync(join(fixtures, "scanned.pdf"));
    await expect(parser.parse(buf)).rejects.toMatchObject({
      code: "NEEDS_OCR",
    });
  });
});

describe("formatFromUpload", () => {
  it("detects docx and pdf", () => {
    expect(
      formatFromUpload(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
    ).toBe("docx");
    expect(formatFromUpload("application/pdf", "a.pdf")).toBe("pdf");
    expect(formatFromUpload("application/msword", "legacy.doc")).toBeNull();
  });
});
