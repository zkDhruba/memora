import { Injectable } from "@nestjs/common";

/** Prefer inline `documents.text` below this size; otherwise object storage. */
export const TEXT_INLINE_MAX_BYTES = 100 * 1024;
export const DOCUMENT_PREVIEW_CHARS = 2000;

export type TextDocumentKind = "plain_text" | "markdown";

export class TextParseError extends Error {
  constructor(
    message: string,
    readonly code: "ENCODING" | "EMPTY" | "BINARY",
  ) {
    super(message);
    this.name = "TextParseError";
  }
}

export type ParsedTextDocument = {
  kind: TextDocumentKind;
  text: string;
  charCount: number;
  preview: string;
  storeInline: boolean;
  /** First ISO-8601 date found near the start of the file, if any. */
  documentDate: string | null;
};

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0)) return true;
  let control = 0;
  for (const b of sample) {
    if (b < 0x09 || (b > 0x0d && b < 0x20)) control += 1;
  }
  return sample.length > 0 && control / sample.length > 0.3;
}

/** Strip BOM, reject binary, decode UTF-8, normalize newlines. */
export function decodeUtf8Text(buf: Buffer): string {
  if (buf.length === 0) {
    throw new TextParseError("Empty file", "EMPTY");
  }
  const withoutBom = buf.subarray(0, 3).equals(UTF8_BOM)
    ? buf.subarray(3)
    : buf;
  if (withoutBom.length === 0) {
    throw new TextParseError("Empty file after BOM", "EMPTY");
  }
  if (looksBinary(withoutBom)) {
    throw new TextParseError("Binary content rejected", "BINARY");
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(withoutBom);
  const normalized = decoded.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.trim().length === 0) {
    throw new TextParseError("File has no non-whitespace text", "EMPTY");
  }
  return normalized;
}

export function kindFromUpload(
  mediaType: string,
  filename: string,
): TextDocumentKind | null {
  const lower = filename.toLowerCase();
  if (mediaType === "text/markdown" || lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }
  if (mediaType === "text/plain" || lower.endsWith(".txt")) {
    return "plain_text";
  }
  return null;
}

const ISO_DATE =
  /\b(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/;

export function findDocumentDate(text: string): string | null {
  const head = text.slice(0, 2048);
  const m = head.match(ISO_DATE);
  return m?.[1] ?? null;
}

@Injectable()
export class TextMarkdownParser {
  parse(
    buf: Buffer,
    opts: { mediaType: string; filename: string },
  ): ParsedTextDocument {
    const kind = kindFromUpload(opts.mediaType, opts.filename);
    if (!kind) {
      throw new TextParseError(
        `Not a text/markdown upload: ${opts.mediaType}`,
        "ENCODING",
      );
    }
    const text = decodeUtf8Text(buf);
    const byteLength = Buffer.byteLength(text, "utf8");
    return {
      kind,
      text,
      charCount: text.length,
      preview: text.slice(0, DOCUMENT_PREVIEW_CHARS),
      storeInline: byteLength <= TEXT_INLINE_MAX_BYTES,
      documentDate: findDocumentDate(text),
    };
  }
}
