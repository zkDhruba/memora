import { Injectable } from "@nestjs/common";
import { extractText, getDocumentProxy } from "unpdf";
import {
  DocumentParseError,
  finalizeParsedText,
  MAX_PDF_PAGES,
  PDF_SPARSE_PAGE_CHARS,
  type ParsedDocument,
} from "./parse-result";

@Injectable()
export class PdfParser {
  async parse(buf: Buffer): Promise<ParsedDocument> {
    if (buf.length === 0) {
      throw new DocumentParseError("Empty PDF", "EMPTY");
    }

    let pageTexts: string[];
    let totalPages: number;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const extracted = await extractText(pdf, { mergePages: false });
      totalPages = extracted.totalPages;
      pageTexts = extracted.text as string[];
    } catch (err) {
      throw new DocumentParseError(
        err instanceof Error ? err.message : "PDF parse failed",
        "PARSE_FAILED",
      );
    }

    if (totalPages < 1 || pageTexts.length === 0) {
      throw new DocumentParseError("PDF has no pages", "EMPTY");
    }

    const truncated = totalPages > MAX_PDF_PAGES;
    const pages = pageTexts.slice(0, MAX_PDF_PAGES);
    const sparseCount = pages.filter(
      (p) => p.replace(/\s+/g, "").length < PDF_SPARSE_PAGE_CHARS,
    ).length;

    if (sparseCount > pages.length / 2) {
      throw new DocumentParseError(
        "PDF looks scanned; OCR required",
        "NEEDS_OCR",
        {
          totalPages,
          pagesChecked: pages.length,
          sparsePages: sparseCount,
          thresholdChars: PDF_SPARSE_PAGE_CHARS,
        },
      );
    }

    const merged = pages
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");

    return finalizeParsedText("prose", merged, {
      source: "pdf",
      totalPages,
      pagesParsed: pages.length,
      truncated,
      sparsePages: sparseCount,
    });
  }
}
