import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  documentChunks,
  documents,
  sourceFiles,
  sourceFileVersions,
  sourceMessages,
  sourceParticipants,
  sourceThreads,
  type MemoraDb,
} from "@memora/db";
import { eq } from "drizzle-orm";
import { ChunkPersistService } from "../chunking/chunk-persist.service";
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
import { decodeUtf8Text } from "./text-markdown.parser";
import { TextMarkdownParser } from "./text-markdown.parser";
import {
  looksLikeWhatsApp,
  WhatsAppParser,
  type ParsedWhatsAppChat,
} from "./whatsapp.parser";

@Injectable()
export class DocumentParseService {
  private readonly log = new Logger(DocumentParseService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
    @Inject(TextMarkdownParser) private readonly textParser: TextMarkdownParser,
    @Inject(DocxParser) private readonly docxParser: DocxParser,
    @Inject(PdfParser) private readonly pdfParser: PdfParser,
    @Inject(WhatsAppParser) private readonly whatsappParser: WhatsAppParser,
    @Inject(ChunkPersistService) private readonly chunks: ChunkPersistService,
  ) {}

  /**
   * Parse a clean file version into documents or WhatsApp messages.
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
      if (format === "plain_text" || format === "markdown") {
        let text: string;
        try {
          text = decodeUtf8Text(bytes);
        } catch (err) {
          if (err instanceof DocumentParseError) throw err;
          throw err;
        }

        if (looksLikeWhatsApp(file.originalFilename, text)) {
          const chat = this.whatsappParser.parse(text, {
            filename: file.originalFilename,
          });
          await this.persistWhatsApp({
            fileId: file.id,
            personaId: file.personaId,
            versionId: version.id,
            generation: input.generation,
            priorReport: version.parseReport ?? {},
            chat,
          });
          return;
        }

        const parsed = this.textParser.parse(bytes, {
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
        return;
      }

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
    format: "docx" | "pdf",
    bytes: Buffer,
    opts: { mediaType: string; filename: string },
  ): Promise<ParsedDocument> {
    void opts;
    if (format === "docx") return this.docxParser.parse(bytes);
    return this.pdfParser.parse(bytes);
  }

  private async clearChatDerivatives(fileId: string) {
    await this.db
      .delete(documentChunks)
      .where(eq(documentChunks.fileId, fileId));
    const threads = await this.db.query.sourceThreads.findMany({
      where: eq(sourceThreads.fileId, fileId),
    });
    for (const t of threads) {
      await this.db
        .delete(sourceMessages)
        .where(eq(sourceMessages.threadId, t.id));
    }
    await this.db.delete(sourceThreads).where(eq(sourceThreads.fileId, fileId));
    await this.db
      .delete(sourceParticipants)
      .where(eq(sourceParticipants.fileId, fileId));
  }

  private async persistWhatsApp(input: {
    fileId: string;
    personaId: string;
    versionId: string;
    generation: number;
    priorReport: Record<string, unknown>;
    chat: ParsedWhatsAppChat;
  }) {
    await this.clearChatDerivatives(input.fileId);
    await this.db
      .delete(documents)
      .where(eq(documents.fileVersionId, input.versionId));

    const labelToId = new Map<string, string>();
    for (const label of input.chat.participants) {
      const id = newId();
      labelToId.set(label, id);
      await this.db.insert(sourceParticipants).values({
        id,
        personaId: input.personaId,
        fileId: input.fileId,
        rawLabel: label,
        role: "unknown",
        // 2.7 / GOV-2: third-party labels are never retrievable until mapped/granted.
        retrievalAllowed: false,
      });
    }

    const threadId = newId();
    await this.db.insert(sourceThreads).values({
      id: threadId,
      personaId: input.personaId,
      fileId: input.fileId,
      title: input.chat.title,
    });

    for (const msg of input.chat.messages) {
      const participantId = msg.rawLabel
        ? (labelToId.get(msg.rawLabel) ?? null)
        : null;
      await this.db
        .insert(sourceMessages)
        .values({
          id: newId(),
          personaId: input.personaId,
          threadId,
          participantId,
          kind: msg.kind,
          sentAt: msg.sentAt,
          body: msg.body,
          bodyHash:
            msg.bodyHash ||
            createHash("sha256").update(msg.body, "utf8").digest("hex"),
          position: msg.position,
        })
        .onConflictDoNothing();
    }

    // Awaiting subject mapping before treated as fully parsed.
    await this.db
      .update(sourceFiles)
      .set({
        status: "needs_attention",
        subjectParticipantId: null,
      })
      .where(eq(sourceFiles.id, input.fileId));

    await this.db
      .update(sourceFileVersions)
      .set({
        parseReport: {
          ...input.priorReport,
          parse: "ok",
          format: "whatsapp",
          dateStyle: input.chat.dateStyle,
          speechCount: input.chat.speechCount,
          participantCount: input.chat.participants.length,
          anomalyCount: input.chat.anomalies.length,
          needsSubjectMapping: true,
          processedAt: new Date().toISOString(),
          generation: input.generation,
        },
      })
      .where(eq(sourceFileVersions.id, input.versionId));
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
      .delete(documentChunks)
      .where(eq(documentChunks.fileId, input.fileId));
    await this.db
      .delete(documents)
      .where(eq(documents.fileVersionId, input.versionId));
    const documentId = newId();
    await this.db.insert(documents).values({
      id: documentId,
      personaId: input.personaId,
      fileVersionId: input.versionId,
      kind: input.parsed.kind,
      language: "und",
      text,
      textObjectKey,
      preview: input.parsed.preview,
      charCount: input.parsed.charCount,
    });

    const chunkCount = await this.chunks.chunkDocument({
      personaId: input.personaId,
      fileId: input.fileId,
      fileVersionId: input.versionId,
      documentId,
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
          chunkCount,
          chunkedAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          generation: input.generation,
        },
      })
      .where(eq(sourceFileVersions.id, input.versionId));
  }
}
