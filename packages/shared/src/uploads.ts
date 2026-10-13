import { z } from "zod";

/** MIME types accepted for Phase 2 ingestion (extend as parsers land). */
export const ALLOWED_UPLOAD_MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
] as const;

export type AllowedUploadMediaType =
  (typeof ALLOWED_UPLOAD_MEDIA_TYPES)[number];

/** Soft cap per file until plan upload quotas are enforced. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const createImportBodySchema = z.object({}).strict();

export const presignFileBodySchema = z.object({
  importId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mediaType: z.enum(ALLOWED_UPLOAD_MEDIA_TYPES),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const completeFileBodySchema = z
  .object({
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, "sha256 must be 64 hex chars")
      .optional(),
  })
  .strict();

export const subjectMappingBodySchema = z
  .object({
    participantId: z.string().uuid(),
  })
  .strict();

export type CreateImportBody = z.infer<typeof createImportBodySchema>;
export type PresignFileBody = z.infer<typeof presignFileBodySchema>;
export type CompleteFileBody = z.infer<typeof completeFileBodySchema>;
export type SubjectMappingBody = z.infer<typeof subjectMappingBodySchema>;
