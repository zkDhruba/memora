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
import {
  TextMarkdownParser,
  TextParseError,
  kindFromUpload,
} from "./text-markdown.parser";

@Injectable()
export class DocumentParseService {
  private readonly log = new Logger(DocumentParseService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
    @Inject(TextMarkdownParser) private readonly textParser: TextMarkdownParser,
  ) {}

  /**
   * Parse a clean file version into a `documents` row when text/md.
   * Unsupported types leave the file `clean` (DOCX/PDF land in 2.5).
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

    const kind = kindFromUpload(file.mediaType, file.originalFilename);
    if (!kind) {
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
      const parsed = this.textParser.parse(bytes, {
        mediaType: file.mediaType,
        filename: file.originalFilename,
      });

      let text: string | null = parsed.text;
      let textObjectKey: string | null = null;
      if (!parsed.storeInline) {
        textObjectKey = `${version.objectKey}.parsed.txt`;
        await this.objects.putCleanObject({
          objectKey: textObjectKey,
          body: parsed.text,
          mediaType: "text/plain; charset=utf-8",
        });
        text = null;
      }

      await this.db.delete(documents).where(eq(documents.fileVersionId, version.id));
      await this.db.insert(documents).values({
        id: newId(),
        personaId: file.personaId,
        fileVersionId: version.id,
        kind: parsed.kind,
        language: "und",
        text,
        textObjectKey,
        preview: parsed.preview,
        charCount: parsed.charCount,
      });

      await this.db
        .update(sourceFiles)
        .set({ status: "parsed" })
        .where(eq(sourceFiles.id, file.id));

      await this.db
        .update(sourceFileVersions)
        .set({
          parseReport: {
            ...(version.parseReport ?? {}),
            parse: "ok",
            kind: parsed.kind,
            charCount: parsed.charCount,
            storeInline: parsed.storeInline,
            documentDate: parsed.documentDate,
            processedAt: new Date().toISOString(),
            generation: input.generation,
          },
        })
        .where(eq(sourceFileVersions.id, version.id));
    } catch (err) {
      if (err instanceof TextParseError) {
        await this.db
          .update(sourceFiles)
          .set({ status: "needs_attention" })
          .where(eq(sourceFiles.id, file.id));
        await this.db
          .update(sourceFileVersions)
          .set({
            parseReport: {
              ...(version.parseReport ?? {}),
              parse: "failed",
              errorCode: err.code,
              error: err.message,
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
}
