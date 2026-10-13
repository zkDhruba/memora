import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  documents,
  sourceFiles,
  sourceFileVersions,
  type MemoraDb,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";
import { ObjectStoreService } from "../storage/object-store.service";
import { DocxParser } from "./docx.parser";
import { PdfParser } from "./pdf.parser";
import {
  DocumentParseError,
  formatFromUpload,
  type ParsedDocument,
} from "./parse-result";
import { TextMarkdownParser } from "./text-markdown.parser";

@Injectable()
export class DocumentParseService {
  private readonly log = new Logger(DocumentParseService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
    @Inject(TextMarkdownParser) private readonly textParser: TextMarkdownParser,
    @Inject(DocxParser) private readonly docxParser: DocxParser,
    @Inject(PdfParser) private readonly pdfParser: PdfParser,
  ) {}

  /**
   * Parse a clean file version into a `documents` row (text/md/docx/pdf).
   * Unsupported types leave the file `clean`. Scanned PDFs → `needs_attention`.
   */
  async parseFileVersion(input: {
    personaId: string;
    fileVersionId: string;
    generation: number;
  }): Promise<void> {
    const version = await this.db.query.sourceFileVersions.findFirst({
      where: eq(sourceFileVersions.id, input.fileVersionId),
    });
    if (!version) {
      this.log.warn(`parse: missing file version ${input.fileVersionId}`);
      return;
    }
    if (version.generation !== input.generation) {
      this.log.log(
        `parse: skip stale generation ${input.generation} (current ${version.generation})`,
      );
      return;
    }

    const file = await this.db.query.sourceFiles.findFirst({
      where: eq(sourceFiles.id, version.fileId),
    });
    if (!file || file.personaId !== input.personaId) {
      this.log.warn(`parse: missing file for version ${input.fileVersionId}`);
      return;
    }

    const format = formatFromUpload(file.mediaType, file.originalFilename);
    if (!format) {
      await this.db
        .update(sourceFileVersions)
        .set({
          parseReport: {
            ...(version.parseReport ?? {}),
            parse: "skipped_unsupported",
            mediaType: file.mediaType,
            processedAt: new Date().toISOString(),
            generation: input.generation,
          },
        })
        .where(eq(sourceFileVersions.id, version.id));
      return;
    }

    let bytes: Buffer;
    try {
      bytes = await this.objects.getCleanObject(version.objectKey);
    } catch (err) {
      this.log.error(
        `parse: failed to read clean object ${version.objectKey}`,
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }

    try {
      const parsed = await this.parseBytes(format, bytes, {
        mediaType: file.mediaType,
        filename: file.originalFilename,
      });
      await this.persistDocument({
        fileId: file.id,
        personaId: file.personaId,
        versionId: version.id,
        generation: input.generation,
        priorReport: version.parseReport ?? {},
        objectKey: version.objectKey,
        parsed,
      });
    } catch (err) {
      if (err instanceof DocumentParseError) {
        await this.db
          .update(sourceFiles)
          .set({ status: "needs_attention" })
          .where(eq(sourceFiles.id, file.id));
        await this.db
          .update(sourceFileVersions)
          .set({
            parseReport: {
              ...(version.parseReport ?? {}),
              parse: err.code === "NEEDS_OCR" ? "needs_ocr" : "failed",
              errorCode: err.code,
              error: err.message,
              ...(err.details ?? {}),
              processedAt: new Date().toISOString(),
              generation: input.generation,
            },
          })
          .where(eq(sourceFileVersions.id, version.id));
        return;
      }
      throw err;
    }
  }

  private async parseBytes(
    format: NonNullable<ReturnType<typeof formatFromUpload>>,
    bytes: Buffer,
    opts: { mediaType: string; filename: string },
  ): Promise<ParsedDocument> {
    switch (format) {
      case "plain_text":
      case "markdown":
        return this.textParser.parse(bytes, opts);
      case "docx":
        return this.docxParser.parse(bytes);
      case "pdf":
        return this.pdfParser.parse(bytes);
    }
  }

  private async persistDocument(input: {
    fileId: string;
    personaId: string;
    versionId: string;
    generation: number;
    priorReport: Record<string, unknown>;
    objectKey: string;
    parsed: ParsedDocument;
  }) {
    let text: string | null = input.parsed.text;
    let textObjectKey: string | null = null;
    if (!input.parsed.storeInline) {
      textObjectKey = `${input.objectKey}.parsed.txt`;
      await this.objects.putCleanObject({
        objectKey: textObjectKey,
        body: input.parsed.text,
        mediaType: "text/plain; charset=utf-8",
      });
      text = null;
    }

    await this.db
      .delete(documents)
      .where(eq(documents.fileVersionId, input.versionId));
    await this.db.insert(documents).values({
      id: newId(),
      personaId: input.personaId,
      fileVersionId: input.versionId,
      kind: input.parsed.kind,
      language: "und",
      text,
      textObjectKey,
      preview: input.parsed.preview,
      charCount: input.parsed.charCount,
    });

    await this.db
      .update(sourceFiles)
      .set({ status: "parsed" })
      .where(eq(sourceFiles.id, input.fileId));

    await this.db
      .update(sourceFileVersions)
      .set({
        parseReport: {
          ...input.priorReport,
          parse: "ok",
          kind: input.parsed.kind,
          charCount: input.parsed.charCount,
          storeInline: input.parsed.storeInline,
          documentDate: input.parsed.documentDate,
          ...(input.parsed.meta ?? {}),
          processedAt: new Date().toISOString(),
          generation: input.generation,
        },
      })
      .where(eq(sourceFileVersions.id, input.versionId));
  }
}
