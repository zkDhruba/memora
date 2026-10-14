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
import { eq, inArray } from "drizzle-orm";
import { DB } from "../db/db.tokens";
import { ObjectStoreService } from "../storage/object-store.service";

/**
 * Removes one file's training derivatives (chunks, messages, parsed docs, objects)
 * and tombstones the file as `deleted`. Does not touch other files on the persona.
 */
@Injectable()
export class FilePurgeService {
  private readonly log = new Logger(FilePurgeService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
  ) {}

  async purgeFile(fileId: string): Promise<{ status: "deleted" }> {
    const file = await this.db.query.sourceFiles.findFirst({
      where: eq(sourceFiles.id, fileId),
    });
    if (!file) {
      return { status: "deleted" };
    }
    if (file.status === "deleted") {
      return { status: "deleted" };
    }

    await this.db
      .update(sourceFiles)
      .set({ status: "deleting", subjectParticipantId: null })
      .where(eq(sourceFiles.id, fileId));

    const versions = await this.db.query.sourceFileVersions.findMany({
      where: eq(sourceFileVersions.fileId, fileId),
    });
    const versionIds = versions.map((v) => v.id);

    // Derived text objects (large bodies) before deleting document rows.
    if (versionIds.length > 0) {
      const docs = await this.db.query.documents.findMany({
        where: inArray(documents.fileVersionId, versionIds),
      });
      for (const doc of docs) {
        if (doc.textObjectKey) {
          await this.objects.deleteCleanObject(doc.textObjectKey).catch((err) => {
            this.log.warn(
              `purge: text object ${doc.textObjectKey}: ${(err as Error).message}`,
            );
          });
        }
      }
    }

    await this.clearDerivatives(fileId, versionIds);

    // Bytes in quarantine or clean buckets (best-effort).
    await this.objects.deleteCleanObject(file.objectKey).catch(() => undefined);
    await this.objects
      .deleteQuarantineObject(file.objectKey)
      .catch(() => undefined);

    // Keep the row as a tombstone so sha256 unique index can exclude it.
    await this.db
      .update(sourceFiles)
      .set({
        status: "deleted",
        subjectParticipantId: null,
        sha256: null,
      })
      .where(eq(sourceFiles.id, fileId));

    this.log.log(`Purged file ${fileId} (${file.originalFilename})`);
    return { status: "deleted" };
  }

  /** Drop chunks / chat / documents for a file (used by purge and reprocess). */
  async clearDerivatives(fileId: string, versionIds?: string[]) {
    const versions =
      versionIds ??
      (
        await this.db.query.sourceFileVersions.findMany({
          where: eq(sourceFileVersions.fileId, fileId),
        })
      ).map((v) => v.id);

    await this.db
      .delete(documentChunks)
      .where(eq(documentChunks.fileId, fileId));

    if (versions.length > 0) {
      await this.db
        .delete(documents)
        .where(inArray(documents.fileVersionId, versions));
    }

    const threads = await this.db.query.sourceThreads.findMany({
      where: eq(sourceThreads.fileId, fileId),
    });
    if (threads.length > 0) {
      await this.db.delete(sourceMessages).where(
        inArray(
          sourceMessages.threadId,
          threads.map((t) => t.id),
        ),
      );
    }
    await this.db.delete(sourceThreads).where(eq(sourceThreads.fileId, fileId));
    await this.db
      .delete(sourceParticipants)
      .where(eq(sourceParticipants.fileId, fileId));
  }
}
