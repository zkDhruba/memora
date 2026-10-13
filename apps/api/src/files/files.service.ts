import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  consents,
  sourceFiles,
  sourceFileVersions,
  sourceImports,
  type MemoraDb,
} from "@memora/db";
import type { CompleteFileBody, PresignFileBody } from "@memora/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiException } from "../common/api-exception";
import { newId } from "../common/ids";
import { AuditService } from "../auth/audit.service";
import { DB } from "../db/db.tokens";
import { PersonaAccessService } from "../personas/persona-access.service";
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
    private readonly access: PersonaAccessService,
    private readonly objects: ObjectStoreService,
    private readonly audit: AuditService,
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
        createdAt: r.createdAt,
      })),
    };
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

    const versionId = newId();
    await this.db.transaction(async (tx) => {
      await tx
        .update(sourceFiles)
        .set({
          status: "uploaded",
          sha256: body.sha256?.toLowerCase() ?? file.sha256,
        })
        .where(eq(sourceFiles.id, fileId));

      const existingVersion = await tx.query.sourceFileVersions.findFirst({
        where: and(
          eq(sourceFileVersions.fileId, fileId),
          eq(sourceFileVersions.generation, 1),
        ),
      });
      if (!existingVersion) {
        await tx.insert(sourceFileVersions).values({
          id: versionId,
          fileId,
          generation: 1,
          objectKey: file.objectKey,
          bucket: file.bucket,
          parseReport: { scan: "pending" },
        });
      }
    });

    await this.audit.record({
      actorUserId: userId,
      personaId,
      action: "file.complete",
      targetType: "source_file",
      targetId: fileId,
      metadata: {
        objectKey: file.objectKey,
        bucket: file.bucket,
        scan: "pending",
      },
    });

    return {
      id: fileId,
      status: "uploaded" as const,
      objectKey: file.objectKey,
      bucket: file.bucket,
      sha256: body.sha256?.toLowerCase() ?? file.sha256,
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
