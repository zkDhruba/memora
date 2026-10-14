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
import { and, eq, sql } from "drizzle-orm";
import { newId } from "../common/ids";
import { DB } from "../db/db.tokens";
import { ObjectStoreService } from "../storage/object-store.service";
import {
  chunkChatThread,
  chunkDocumentText,
  type DocumentKindForChunk,
  type DraftChunk,
} from "./chunker";

@Injectable()
export class ChunkPersistService {
  private readonly log = new Logger(ChunkPersistService.name);

  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
  ) {}

  /** Replace chunks for a document file version. */
  async chunkDocument(input: {
    personaId: string;
    fileId: string;
    fileVersionId: string;
    documentId: string;
  }): Promise<number> {
    const doc = await this.db.query.documents.findFirst({
      where: eq(documents.id, input.documentId),
    });
    if (!doc || doc.personaId !== input.personaId) {
      this.log.warn(`chunkDocument: missing document ${input.documentId}`);
      return 0;
    }

    let text = doc.text ?? "";
    if (!text && doc.textObjectKey) {
      text = (
        await this.objects.getCleanObject(doc.textObjectKey)
      ).toString("utf8");
    }
    if (!text.trim()) return 0;

    const drafts = chunkDocumentText(
      doc.kind as DocumentKindForChunk,
      text,
    );
    await this.replaceFileChunks(input.fileId, drafts, {
      personaId: input.personaId,
      fileVersionId: input.fileVersionId,
      documentId: doc.id,
      threadId: null,
    });
    return drafts.length;
  }

  /** Chunk a WhatsApp thread after subject mapping. */
  async chunkChatFile(input: {
    personaId: string;
    fileId: string;
  }): Promise<number> {
    const file = await this.db.query.sourceFiles.findFirst({
      where: and(
        eq(sourceFiles.id, input.fileId),
        eq(sourceFiles.personaId, input.personaId),
      ),
    });
    if (!file?.subjectParticipantId) {
      this.log.warn(`chunkChatFile: no subject on ${input.fileId}`);
      return 0;
    }

    const version = await this.db.query.sourceFileVersions.findFirst({
      where: eq(sourceFileVersions.fileId, file.id),
      orderBy: (v, { desc }) => [desc(v.generation)],
    });
    if (!version) return 0;

    const thread = await this.db.query.sourceThreads.findFirst({
      where: eq(sourceThreads.fileId, file.id),
    });
    if (!thread) return 0;

    const participants = await this.db.query.sourceParticipants.findMany({
      where: eq(sourceParticipants.fileId, file.id),
    });
    const byId = new Map(participants.map((p) => [p.id, p]));

    const messages = await this.db.query.sourceMessages.findMany({
      where: eq(sourceMessages.threadId, thread.id),
      orderBy: (m, { asc }) => [asc(m.position)],
    });

    const counterparty =
      participants.find(
        (p) =>
          p.id !== file.subjectParticipantId && p.role === "other",
      )?.rawLabel ?? null;

    const drafts = chunkChatThread({
      threadId: thread.id,
      counterpartyLabel: counterparty,
      messages: messages
        .filter((m) => m.kind === "speech")
        .map((m) => {
          const p = m.participantId ? byId.get(m.participantId) : undefined;
          const role = (p?.role ?? "unknown") as
            | "subject"
            | "other"
            | "unknown";
          return {
            position: m.position,
            body: m.body,
            sentAt: m.sentAt,
            speakerRole: role,
            retrievalAllowed: p?.retrievalAllowed ?? false,
            rawLabel: p?.rawLabel ?? null,
          };
        }),
    });

    await this.replaceFileChunks(file.id, drafts, {
      personaId: input.personaId,
      fileVersionId: version.id,
      documentId: null,
      threadId: thread.id,
    });

    await this.db
      .update(sourceFileVersions)
      .set({
        parseReport: {
          ...(version.parseReport ?? {}),
          chunkCount: drafts.length,
          chunkedAt: new Date().toISOString(),
        },
      })
      .where(eq(sourceFileVersions.id, version.id));

    return drafts.length;
  }

  private async replaceFileChunks(
    fileId: string,
    drafts: DraftChunk[],
    meta: {
      personaId: string;
      fileVersionId: string;
      documentId: string | null;
      threadId: string | null;
    },
  ) {
    await this.db
      .delete(documentChunks)
      .where(eq(documentChunks.fileId, fileId));

    for (const d of drafts) {
      const id = newId();
      await this.db.insert(documentChunks).values({
        id,
        personaId: meta.personaId,
        fileId,
        fileVersionId: meta.fileVersionId,
        documentId: meta.documentId,
        threadId: meta.threadId,
        messageStart: d.messageStart,
        messageEnd: d.messageEnd,
        sourceKind: d.sourceKind,
        header: d.header,
        content: d.content,
        speakerRole: d.speakerRole,
        audience: "private",
        sensitivity: "general",
        timeStart: d.timeStart,
        timeEnd: d.timeEnd,
        retrievalAllowed: d.retrievalAllowed,
        tokenCount: d.tokenCount,
      });
      // Populate FTS column (simple config for MVP / Bangla-safe).
      await this.db.execute(
        sql`update document_chunks set content_tsv = to_tsvector('simple', ${d.content}) where id = ${id}::uuid`,
      );
    }
  }
}
