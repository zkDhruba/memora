import { Injectable } from "@nestjs/common";
import {
  DOCUMENT_PREVIEW_CHARS,
  TextParseError,
  TEXT_INLINE_MAX_BYTES,
  findDocumentDate,
  formatFromUpload,
  type ParsedDocument,
} from "./parse-result";

export {
  TextParseError,
  findDocumentDate,
  TEXT_INLINE_MAX_BYTES,
  DOCUMENT_PREVIEW_CHARS,
} from "./parse-result";

export type TextDocumentKind = "plain_text" | "markdown";
export type ParsedTextDocument = ParsedDocument;

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
  const fmt = formatFromUpload(mediaType, filename);
  if (fmt === "plain_text" || fmt === "markdown") return fmt;
  return null;
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
