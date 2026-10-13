import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sourceFileStatusEnum, sourceImportStatusEnum } from "./enums";
import { personas } from "./personas";
import { users } from "./users";

export const sourceImports = pgTable(
  "source_imports",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    status: sourceImportStatusEnum("status").notNull().default("open"),
    fileCount: integer("file_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("source_imports_persona_id_idx").on(t.personaId)],
);

export const sourceFiles = pgTable(
  "source_files",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    importId: uuid("import_id")
      .notNull()
      .references(() => sourceImports.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    originalFilename: text("original_filename").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    objectKey: text("object_key").notNull(),
    bucket: text("bucket").notNull(),
    status: sourceFileStatusEnum("status").notNull().default("pending_upload"),
    subjectParticipantId: uuid("subject_participant_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("source_files_persona_status_idx").on(t.personaId, t.status),
    index("source_files_import_id_idx").on(t.importId),
    uniqueIndex("source_files_persona_sha256_uq")
      .on(t.personaId, t.sha256)
      .where(
        sql`${t.sha256} is not null and ${t.status} not in ('deleted', 'deleting')`,
      ),
  ],
);

export const sourceFileVersions = pgTable(
  "source_file_versions",
  {
    id: uuid("id").primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull(),
    objectKey: text("object_key").notNull(),
    bucket: text("bucket").notNull(),
    parseReport: jsonb("parse_report")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("source_file_versions_file_generation_uq").on(
      t.fileId,
      t.generation,
    ),
  ],
);
