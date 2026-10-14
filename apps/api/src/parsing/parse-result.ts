/** Prefer inline `documents.text` below this size; otherwise object storage. */
export const TEXT_INLINE_MAX_BYTES = 100 * 1024;
export const DOCUMENT_PREVIEW_CHARS = 2000;
/** Ingestion pipeline page cap for PDF. */
export const MAX_PDF_PAGES = 200;
/** Pages with fewer chars than this count as "empty" for OCR detection. */
export const PDF_SPARSE_PAGE_CHARS = 50;

export type StoredDocumentKind = "plain_text" | "markdown" | "prose";

export type ParseFormat = "plain_text" | "markdown" | "docx" | "pdf";

export class DocumentParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ENCODING"
      | "EMPTY"
      | "BINARY"
      | "NEEDS_OCR"
      | "PARSE_FAILED"
      | "UNSUPPORTED",
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DocumentParseError";
  }
}

/** @deprecated Prefer DocumentParseError — kept for text parser tests. */
export class TextParseError extends DocumentParseError {
  constructor(
    message: string,
    code: "ENCODING" | "EMPTY" | "BINARY",
  ) {
    super(message, code);
    this.name = "TextParseError";
  }
}

export type ParsedDocument = {
  kind: StoredDocumentKind;
  text: string;
  charCount: number;
  preview: string;
  storeInline: boolean;
  documentDate: string | null;
  meta?: Record<string, unknown>;
};

const ISO_DATE =
  /\b(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/;

/** Mammoth markdown escapes `-` and `.`; strip escapes before date scan. */
export function findDocumentDate(text: string): string | null {
  const head = text
    .slice(0, 2048)
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
  const m = head.match(ISO_DATE);
  return m?.[1] ?? null;
}

export function finalizeParsedText(
  kind: StoredDocumentKind,
  text: string,
  meta?: Record<string, unknown>,
  documentDate: string | null = null,
): ParsedDocument {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalized.length === 0) {
    throw new DocumentParseError("Extracted text is empty", "EMPTY");
  }
  const byteLength = Buffer.byteLength(normalized, "utf8");
  return {
    kind,
    text: normalized,
    charCount: normalized.length,
    preview: normalized.slice(0, DOCUMENT_PREVIEW_CHARS),
    storeInline: byteLength <= TEXT_INLINE_MAX_BYTES,
    documentDate: documentDate ?? findDocumentDate(normalized),
    meta,
  };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|bmp|tiff?)$/i;

/** Screenshots / photos are Phase 5 — never treat as text even if MIME was guessed wrong. */
export function isImageUpload(mediaType: string, filename: string): boolean {
  return mediaType.startsWith("image/") || IMAGE_EXT.test(filename);
}

export function formatFromUpload(
  mediaType: string,
  filename: string,
): ParseFormat | null {
  const lower = filename.toLowerCase();
  if (isImageUpload(mediaType, filename)) {
    return null;
  }
  if (mediaType === "application/pdf" || lower.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    mediaType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    mediaType === "text/markdown" ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown")
  ) {
    return "markdown";
  }
  if (mediaType === "text/plain" || lower.endsWith(".txt")) {
    return "plain_text";
  }
  return null;
}
