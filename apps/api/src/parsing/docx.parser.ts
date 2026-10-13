import { Injectable } from "@nestjs/common";
import mammoth from "mammoth";
import {
  DocumentParseError,
  finalizeParsedText,
  type ParsedDocument,
} from "./parse-result";

type MammothMd = {
  convertToMarkdown: (input: {
    buffer: Buffer;
  }) => Promise<{
    value: string;
    messages: { type: string; message: string }[];
  }>;
};

/** mammoth ships convertToMarkdown; bundled types omit it. */
const mammothMd = mammoth as unknown as MammothMd;

@Injectable()
export class DocxParser {
  async parse(buf: Buffer): Promise<ParsedDocument> {
    if (buf.length === 0) {
      throw new DocumentParseError("Empty DOCX", "EMPTY");
    }

    let result: {
      value: string;
      messages: { type: string; message: string }[];
    };
    try {
      result = await mammothMd.convertToMarkdown({ buffer: buf });
    } catch (err) {
      throw new DocumentParseError(
        err instanceof Error ? err.message : "DOCX parse failed",
        "PARSE_FAILED",
      );
    }

    const imageWarnings = result.messages.filter((m) =>
      /image/i.test(m.message),
    ).length;

    return finalizeParsedText("markdown", result.value, {
      source: "docx",
      imagesIgnored: imageWarnings,
      mammothMessages: result.messages.length,
    });
  }
}
