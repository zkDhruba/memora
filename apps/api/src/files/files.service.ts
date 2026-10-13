import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  consents,
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
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { AuditService } from "../auth/audit.service";
import { DB } from "../db/db.tokens";
import { PersonaAccessService } from "../personas/persona-access.service";
import { IngestionQueueService } from "../jobs/ingestion-queue.service";
import { ClamavScannerService } from "../scanning/clamav-scanner.service";
import { ObjectStoreService } from "../storage/object-store.service";

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
    return {
      id: row.id,
      status: row.status,
      fileCount: row.fileCount,
      createdAt: row.createdAt,
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
      .set({ role: "other" })
      .where(
        and(
          eq(sourceParticipants.fileId, file.id),
          ne(sourceParticipants.id, body.participantId),
        ),
      );
    await this.db
      .update(sourceParticipants)
      .set({ role: "subject" })
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

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.subject_mapping",
      targetType: "source_file",
      targetId: file.id,
      metadata: {
        participantId: body.participantId,
        rawLabel: participant.rawLabel,
      },
    });

    return {
      fileId: file.id,
      subjectParticipantId: body.participantId,
      subjectLabel: participant.rawLabel,
      status: "parsed" as const,
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
