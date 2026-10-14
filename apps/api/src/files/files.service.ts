import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  consents,
  documentChunks,
  processingJobs,
  sourceFiles,
  sourceFileVersions,
  sourceImports,
  sourceParticipants,
  type MemoraDb,
} from "@memora/db";
import type {
  CompleteFileBody,
  PresignFileBody,
  SubjectMappingBody,
} from "@memora/shared";
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { AuditService } from "../auth/audit.service";
import { ChunkPersistService } from "../chunking/chunk-persist.service";
import { DB } from "../db/db.tokens";
import { PersonaAccessService } from "../personas/persona-access.service";
import { IngestionQueueService } from "../jobs/ingestion-queue.service";
import { ClamavScannerService } from "../scanning/clamav-scanner.service";
import { ObjectStoreService } from "../storage/object-store.service";
import { FilePurgeService } from "./file-purge.service";
import {
  fileProgressPercent,
  isFileTerminal,
  jobProgressPercent,
} from "./import-progress";

function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "upload";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "upload";
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(DB) private readonly db: MemoraDb,
    @Inject(PersonaAccessService) private readonly access: PersonaAccessService,
    @Inject(ObjectStoreService) private readonly objects: ObjectStoreService,
    @Inject(ClamavScannerService) private readonly scanner: ClamavScannerService,
    @Inject(IngestionQueueService)
    private readonly ingestion: IngestionQueueService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ChunkPersistService) private readonly chunks: ChunkPersistService,
    @Inject(FilePurgeService) private readonly purge: FilePurgeService,
  ) {}

  async createImport(userId: string, personaId: string) {
    await this.access.requireContributor(userId, personaId);
    await this.requireHostConsent(personaId);

    const id = newId();
    await this.db.insert(sourceImports).values({
      id,
      personaId,
      createdByUserId: userId,
      status: "open",
      fileCount: 0,
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "import.create",
      targetType: "source_import",
      targetId: id,
    });

    return { id, status: "open" as const, fileCount: 0 };
  }

  async getImport(userId: string, personaId: string, importId: string) {
    await this.access.requireContributor(userId, personaId);
    const row = await this.db.query.sourceImports.findFirst({
      where: and(
        eq(sourceImports.id, importId),
        eq(sourceImports.personaId, personaId),
      ),
    });
    if (!row) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "IMPORT_NOT_FOUND",
        "Import not found.",
      );
    }

    const files = await this.db.query.sourceFiles.findMany({
      where: and(
        eq(sourceFiles.importId, importId),
        eq(sourceFiles.personaId, personaId),
        sql`${sourceFiles.status} not in ('deleted', 'deleting')`,
      ),
      orderBy: (f, { asc }) => [asc(f.createdAt)],
      with: {
        participants: { columns: { id: true } },
        versions: {
          orderBy: (v, { desc: d }) => [d(v.generation)],
          limit: 1,
        },
      },
    });

    const filePayloads = [];
    for (const f of files) {
      const version = f.versions[0];
      let jobs: Array<{
        id: string;
        stage: string;
        status: string;
        attempts: number;
        errorCode: string | null;
        percent: number;
        generation: number;
      }> = [];

      if (version) {
        const jobRows = await this.db.query.processingJobs.findMany({
          where: eq(processingJobs.fileVersionId, version.id),
          orderBy: (j, { asc }) => [asc(j.createdAt)],
        });
        jobs = jobRows.map((j) => ({
          id: j.id,
          stage: j.stage,
          status: j.status,
          attempts: j.attempts,
          errorCode: j.errorCode,
          percent: jobProgressPercent(j.status),
          generation: j.generation,
        }));
      }

      const latestJob = jobs[jobs.length - 1];
      const parseReport = (version?.parseReport ?? {}) as Record<
        string,
        unknown
      >;
      const terminal = isFileTerminal(f.status, {
        jobStatus: latestJob?.status,
      });
      const percent = fileProgressPercent({
        fileStatus: f.status,
        jobStatus: latestJob?.status,
        jobStage: latestJob?.stage,
      });

      filePayloads.push({
        id: f.id,
        originalFilename: f.originalFilename,
        mediaType: f.mediaType,
        byteSize: f.byteSize,
        status: f.status,
        subjectParticipantId: f.subjectParticipantId,
        participantCount: f.participants.length,
        needsSubjectMapping:
          f.subjectParticipantId == null && f.participants.length > 0,
        terminal,
        percent,
        stage: latestJob?.stage ?? null,
        jobStatus: latestJob?.status ?? null,
        errorCode: latestJob?.errorCode ?? null,
        chunkCount:
          typeof parseReport.chunkCount === "number"
            ? parseReport.chunkCount
            : null,
        parseFormat:
          typeof parseReport.format === "string"
            ? parseReport.format
            : typeof parseReport.kind === "string"
              ? parseReport.kind
              : null,
        jobs,
        createdAt: f.createdAt,
      });
    }

    const terminal =
      filePayloads.length > 0 && filePayloads.every((f) => f.terminal);
    const percent =
      filePayloads.length === 0
        ? 0
        : Math.round(
            filePayloads.reduce((sum, f) => sum + f.percent, 0) /
              filePayloads.length,
          );

    return {
      id: row.id,
      status: row.status,
      fileCount: row.fileCount,
      createdAt: row.createdAt,
      terminal,
      percent,
      files: filePayloads,
    };
  }

  async listFiles(userId: string, personaId: string) {
    await this.access.requireContributor(userId, personaId);
    const rows = await this.db.query.sourceFiles.findMany({
      where: and(
        eq(sourceFiles.personaId, personaId),
        sql`${sourceFiles.status} not in ('deleted', 'deleting')`,
      ),
      orderBy: (f, { desc }) => [desc(f.createdAt)],
      with: { participants: { columns: { id: true } } },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        importId: r.importId,
        originalFilename: r.originalFilename,
        mediaType: r.mediaType,
        byteSize: r.byteSize,
        sha256: r.sha256,
        status: r.status,
        subjectParticipantId: r.subjectParticipantId,
        participantCount: r.participants.length,
        needsSubjectMapping:
          r.subjectParticipantId == null && r.participants.length > 0,
        createdAt: r.createdAt,
      })),
    };
  }

  async listParticipants(userId: string, personaId: string, fileId: string) {
    await this.access.requireContributor(userId, personaId);
    const file = await this.requireFile(personaId, fileId);
    const rows = await this.db.query.sourceParticipants.findMany({
      where: and(
        eq(sourceParticipants.fileId, file.id),
        eq(sourceParticipants.personaId, personaId),
      ),
      orderBy: (p, { asc }) => [asc(p.rawLabel)],
    });
    return {
      fileId: file.id,
      subjectParticipantId: file.subjectParticipantId,
      needsSubjectMapping:
        file.subjectParticipantId == null && rows.length > 0,
      data: rows.map((r) => ({
        id: r.id,
        rawLabel: r.rawLabel,
        role: r.role,
        retrievalAllowed: r.retrievalAllowed,
      })),
    };
  }

  async mapSubject(
    userId: string,
    personaId: string,
    fileId: string,
    body: SubjectMappingBody,
  ) {
    await this.access.requireOwnerOrManager(userId, personaId);
    const file = await this.requireFile(personaId, fileId);

    const participant = await this.db.query.sourceParticipants.findFirst({
      where: and(
        eq(sourceParticipants.id, body.participantId),
        eq(sourceParticipants.fileId, file.id),
        eq(sourceParticipants.personaId, personaId),
      ),
    });
    if (!participant) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "PARTICIPANT_NOT_FOUND",
        "Participant not found on this file.",
      );
    }

    await this.db
      .update(sourceParticipants)
      .set({ role: "other", retrievalAllowed: false })
      .where(
        and(
          eq(sourceParticipants.fileId, file.id),
          ne(sourceParticipants.id, body.participantId),
        ),
      );
    await this.db
      .update(sourceParticipants)
      .set({ role: "subject", retrievalAllowed: true })
      .where(eq(sourceParticipants.id, body.participantId));

    await this.db
      .update(sourceFiles)
      .set({
        subjectParticipantId: body.participantId,
        status: "parsed",
      })
      .where(eq(sourceFiles.id, file.id));

    const version = await this.db.query.sourceFileVersions.findFirst({
      where: eq(sourceFileVersions.fileId, file.id),
      orderBy: (v, { desc }) => [desc(v.generation)],
    });
    if (version) {
      await this.db
        .update(sourceFileVersions)
        .set({
          parseReport: {
            ...(version.parseReport ?? {}),
            needsSubjectMapping: false,
            subjectParticipantId: body.participantId,
            subjectLabel: participant.rawLabel,
            mappedAt: new Date().toISOString(),
          },
        })
        .where(eq(sourceFileVersions.id, version.id));
    }

    const chunkCount = await this.chunks.chunkChatFile({
      personaId,
      fileId: file.id,
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.subject_mapping",
      targetType: "source_file",
      targetId: file.id,
      metadata: {
        participantId: body.participantId,
        rawLabel: participant.rawLabel,
        chunkCount,
      },
    });

    return {
      fileId: file.id,
      subjectParticipantId: body.participantId,
      subjectLabel: participant.rawLabel,
      status: "parsed" as const,
      subjectRetrievalAllowed: true,
      othersRetrievalAllowed: false,
      chunkCount,
    };
  }

  private async requireFile(personaId: string, fileId: string) {
    const file = await this.db.query.sourceFiles.findFirst({
      where: and(
        eq(sourceFiles.id, fileId),
        eq(sourceFiles.personaId, personaId),
      ),
    });
    if (!file || file.status === "deleted" || file.status === "deleting") {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "FILE_NOT_FOUND",
        "File not found.",
      );
    }
    return file;
  }

  async presign(userId: string, personaId: string, body: PresignFileBody) {
    await this.access.requireContributor(userId, personaId);
    await this.requireHostConsent(personaId);

    const imp = await this.db.query.sourceImports.findFirst({
      where: and(
        eq(sourceImports.id, body.importId),
        eq(sourceImports.personaId, personaId),
      ),
    });
    if (!imp || imp.status !== "open") {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "IMPORT_CLOSED",
        "Import is missing or not open for uploads.",
      );
    }

    const fileId = newId();
    const safeName = sanitizeFilename(body.filename);
    const objectKey = `personas/${personaId}/imports/${body.importId}/${fileId}/${safeName}`;
    const bucket = this.objects.quarantineBucket();

    await this.db.insert(sourceFiles).values({
      id: fileId,
      personaId,
      importId: body.importId,
      uploadedByUserId: userId,
      originalFilename: safeName,
      mediaType: body.mediaType,
      byteSize: body.byteSize,
      objectKey,
      bucket,
      status: "pending_upload",
    });

    await this.db
      .update(sourceImports)
      .set({ fileCount: sql`${sourceImports.fileCount} + 1` })
      .where(eq(sourceImports.id, body.importId));

    const signed = await this.objects.presignPutQuarantine({
      objectKey,
      mediaType: body.mediaType,
      byteSize: body.byteSize,
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.presign",
      targetType: "source_file",
      targetId: fileId,
      metadata: {
        importId: body.importId,
        mediaType: body.mediaType,
        byteSize: body.byteSize,
      },
    });

    return {
      fileId,
      importId: body.importId,
      objectKey,
      bucket,
      url: signed.url,
      headers: signed.headers,
      expiresIn: signed.expiresIn,
    };
  }

  async complete(
    userId: string,
    personaId: string,
    fileId: string,
    body: CompleteFileBody,
  ) {
    await this.access.requireContributor(userId, personaId);

    const file = await this.db.query.sourceFiles.findFirst({
      where: and(
        eq(sourceFiles.id, fileId),
        eq(sourceFiles.personaId, personaId),
      ),
    });
    if (!file || file.status === "deleted" || file.status === "deleting") {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "FILE_NOT_FOUND",
        "File not found.",
      );
    }
    if (file.status !== "pending_upload" && file.status !== "uploaded") {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "FILE_STATE",
        "File is not awaiting upload completion.",
      );
    }

    const head = await this.objects.headQuarantineObject(file.objectKey);
    if (!head) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "FILE_NOT_UPLOADED",
        "Object not found in quarantine. Upload with the presigned URL first.",
      );
    }
    if (
      head.contentLength !== undefined &&
      head.contentLength !== file.byteSize
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "FILE_SIZE_MISMATCH",
        "Uploaded object size does not match the declared byteSize.",
        {
          expected: file.byteSize,
          actual: head.contentLength,
        },
      );
    }

    if (body.sha256) {
      const dup = await this.db.query.sourceFiles.findFirst({
        where: and(
          eq(sourceFiles.personaId, personaId),
          eq(sourceFiles.sha256, body.sha256.toLowerCase()),
          sql`${sourceFiles.status} not in ('deleted', 'deleting')`,
          sql`${sourceFiles.id} <> ${fileId}`,
        ),
      });
      if (dup) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "FILE_DUPLICATE",
          "A file with this content hash already exists for this persona.",
          { existingFileId: dup.id },
        );
      }
    }

    let bytes: Buffer;
    try {
      bytes = await this.objects.getQuarantineObject(file.objectKey);
    } catch (err) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "FILE_NOT_UPLOADED",
        "Could not read quarantine object for scanning.",
        { cause: (err as Error).message },
      );
    }

    let scan;
    try {
      scan = await this.scanner.scanBuffer(bytes);
    } catch (err) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SCANNER_UNAVAILABLE",
        "Virus scanner is unavailable. Try again shortly.",
        { cause: (err as Error).message },
      );
    }

    const sha256 = body.sha256?.toLowerCase() ?? file.sha256;

    if (!scan.clean) {
      await this.objects.deleteQuarantineObject(file.objectKey).catch(() => {
        // best-effort delete
      });

      await this.db
        .update(sourceFiles)
        .set({ status: "infected", sha256 })
        .where(eq(sourceFiles.id, fileId));

      await this.upsertVersion(fileId, file.objectKey, file.bucket, {
        scan: "infected",
        signature: scan.signature,
      }); // no parse enqueue for infected files

      await this.audit.record({
        actorUserId: userId,
        personaId,
        action: "file.scan_infected",
        targetType: "source_file",
        targetId: fileId,
        metadata: { signature: scan.signature },
      });

      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "FILE_INFECTED",
        "Upload rejected: malware detected.",
        { signature: scan.signature },
      );
    }

    const promoted = await this.objects.promoteQuarantineToClean(file.objectKey);

    await this.db
      .update(sourceFiles)
      .set({
        status: "clean",
        sha256,
        bucket: promoted.bucket,
        objectKey: promoted.objectKey,
      })
      .where(eq(sourceFiles.id, fileId));

    const versionId = await this.upsertVersion(
      fileId,
      promoted.objectKey,
      promoted.bucket,
      { scan: "clean" },
    );

    const queued = await this.ingestion.enqueue({
      personaId,
      fileVersionId: versionId,
      stage: "parse",
      generation: 1,
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.complete",
      targetType: "source_file",
      targetId: fileId,
      metadata: {
        objectKey: promoted.objectKey,
        bucket: promoted.bucket,
        scan: "clean",
        parseJobId: queued.processingJobId,
      },
    });

    return {
      id: fileId,
      status: "clean" as const,
      objectKey: promoted.objectKey,
      bucket: promoted.bucket,
      sha256,
      processingJobId: queued.processingJobId,
    };
  }

  private async upsertVersion(
    fileId: string,
    objectKey: string,
    bucket: string,
    parseReport: Record<string, unknown>,
  ): Promise<string> {
    const existing = await this.db.query.sourceFileVersions.findFirst({
      where: and(
        eq(sourceFileVersions.fileId, fileId),
        eq(sourceFileVersions.generation, 1),
      ),
    });
    if (existing) {
      await this.db
        .update(sourceFileVersions)
        .set({ objectKey, bucket, parseReport })
        .where(eq(sourceFileVersions.id, existing.id));
      return existing.id;
    }
    const id = newId();
    await this.db.insert(sourceFileVersions).values({
      id,
      fileId,
      generation: 1,
      objectKey,
      bucket,
      parseReport,
    });
    return id;
  }

  /**
   * Owner or uploader may delete. Removes chunks/messages/docs/objects for this
   * file only; other persona files are untouched.
   */
  async deleteFile(userId: string, personaId: string, fileId: string) {
    const { membership } = await this.access.requireContributor(
      userId,
      personaId,
    );
    const file = await this.db.query.sourceFiles.findFirst({
      where: and(
        eq(sourceFiles.id, fileId),
        eq(sourceFiles.personaId, personaId),
      ),
    });
    if (!file || file.status === "deleted") {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "FILE_NOT_FOUND",
        "File not found.",
      );
    }
    const isOwner = membership.role === "owner";
    const isUploader = file.uploadedByUserId === userId;
    if (!isOwner && !isUploader) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "PERSONA_FORBIDDEN",
        "Only the owner or uploader can delete this file.",
      );
    }

    const [chunkBefore] = await this.db
      .select({ value: count() })
      .from(documentChunks)
      .where(eq(documentChunks.fileId, fileId));

    await this.purge.purgeFile(fileId);

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.purge",
      targetType: "source_file",
      targetId: fileId,
      metadata: {
        originalFilename: file.originalFilename,
        chunksRemoved: Number(chunkBefore?.value ?? 0),
      },
    });

    return {
      id: fileId,
      status: "deleted" as const,
      chunksRemoved: Number(chunkBefore?.value ?? 0),
    };
  }

  /**
   * Purge every non-deleted file in the import, then close the import.
   * Training content from those files is removed; other imports stay.
   */
  async deleteImport(userId: string, personaId: string, importId: string) {
    await this.access.requireOwner(userId, personaId);
    const imp = await this.db.query.sourceImports.findFirst({
      where: and(
        eq(sourceImports.id, importId),
        eq(sourceImports.personaId, personaId),
      ),
    });
    if (!imp) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "IMPORT_NOT_FOUND",
        "Import not found.",
      );
    }

    const files = await this.db.query.sourceFiles.findMany({
      where: and(
        eq(sourceFiles.importId, importId),
        eq(sourceFiles.personaId, personaId),
        sql`${sourceFiles.status} not in ('deleted')`,
      ),
    });

    let chunksRemoved = 0;
    for (const f of files) {
      const result = await this.deleteFile(userId, personaId, f.id);
      chunksRemoved += result.chunksRemoved;
    }

    await this.db
      .update(sourceImports)
      .set({ status: "closed" })
      .where(eq(sourceImports.id, importId));

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "import.purge",
      targetType: "source_import",
      targetId: importId,
      metadata: { filesPurged: files.length, chunksRemoved },
    });

    return {
      id: importId,
      status: "closed" as const,
      filesPurged: files.length,
      chunksRemoved,
    };
  }

  /**
   * Bump generation and re-parse. Clears this file's derivatives first so old
   * chunks cannot linger while the new parse runs.
   */
  async reprocessFile(userId: string, personaId: string, fileId: string) {
    await this.access.requireOwnerOrManager(userId, personaId);
    const file = await this.requireFile(personaId, fileId);

    if (
      !["clean", "parsed", "needs_attention", "ready"].includes(file.status)
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "FILE_STATE",
        "File cannot be reprocessed in its current state.",
        { status: file.status },
      );
    }

    const latest = await this.db.query.sourceFileVersions.findFirst({
      where: eq(sourceFileVersions.fileId, fileId),
      orderBy: [desc(sourceFileVersions.generation)],
    });
    if (!latest) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "FILE_STATE",
        "File has no version to reprocess.",
      );
    }

    await this.purge.clearDerivatives(fileId);
    await this.db
      .update(sourceFiles)
      .set({ status: "clean", subjectParticipantId: null })
      .where(eq(sourceFiles.id, fileId));

    const generation = latest.generation + 1;
    const versionId = newId();
    await this.db.insert(sourceFileVersions).values({
      id: versionId,
      fileId,
      generation,
      objectKey: latest.objectKey,
      bucket: latest.bucket,
      parseReport: { reprocessFrom: latest.generation },
    });

    const queued = await this.ingestion.enqueue({
      personaId,
      fileVersionId: versionId,
      stage: "parse",
      generation,
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.reprocess",
      targetType: "source_file",
      targetId: fileId,
      metadata: { generation, processingJobId: queued.processingJobId },
    });

    return {
      id: fileId,
      status: "clean" as const,
      generation,
      processingJobId: queued.processingJobId,
    };
  }

  private async requireHostConsent(personaId: string) {
    const row = await this.db.query.consents.findFirst({
      where: and(
        eq(consents.personaId, personaId),
        eq(consents.purpose, "host_records"),
        isNull(consents.revokedAt),
      ),
    });
    if (!row) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "CONSENT_REQUIRED",
        "host_records consent is required before uploading files.",
        { purpose: "host_records" },
      );
    }
  }
}
