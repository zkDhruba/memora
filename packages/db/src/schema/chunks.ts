import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  chunkSensitivityEnum,
  chunkSourceKindEnum,
  chunkSpeakerRoleEnum,
  membershipAudienceEnum,
} from "./enums";
import { documents } from "./documents";
import { personas } from "./personas";
import { sourceFiles, sourceFileVersions } from "./sources";
import { sourceThreads } from "./chat-sources";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Indexed passages. `content` is the citation body (no synthetic header).
 * `header` is prepended when embedding (Phase 3).
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => sourceFileVersions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    threadId: uuid("thread_id").references(() => sourceThreads.id, {
      onDelete: "cascade",
    }),
    /** Inclusive message positions for chat windows. */
    messageStart: integer("message_start"),
    messageEnd: integer("message_end"),
    sourceKind: chunkSourceKindEnum("source_kind").notNull(),
    header: text("header"),
    content: text("content").notNull(),
    contentTsv: tsvector("content_tsv"),
    speakerRole: chunkSpeakerRoleEnum("speaker_role").notNull(),
    audience: membershipAudienceEnum("audience").notNull().default("private"),
    sensitivity: chunkSensitivityEnum("sensitivity")
      .notNull()
      .default("general"),
    timeStart: timestamp("time_start", { withTimezone: true }),
    timeEnd: timestamp("time_end", { withTimezone: true }),
    retrievalAllowed: boolean("retrieval_allowed").notNull().default(false),
    tokenCount: integer("token_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("document_chunks_persona_id_idx").on(t.personaId),
    index("document_chunks_file_id_idx").on(t.fileId),
    index("document_chunks_document_id_idx").on(t.documentId),
    index("document_chunks_retrieval_idx").on(
      t.personaId,
      t.retrievalAllowed,
      t.speakerRole,
    ),
    index("document_chunks_content_tsv_idx").using(
      "gin",
      sql`${t.contentTsv}`,
    ),
  ],
);
