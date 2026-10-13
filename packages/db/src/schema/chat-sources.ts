import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  sourceMessageKindEnum,
  sourceParticipantRoleEnum,
} from "./enums";
import { personas } from "./personas";
import { sourceFiles } from "./sources";

export const sourceParticipants = pgTable(
  "source_participants",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "cascade" }),
    rawLabel: text("raw_label").notNull(),
    role: sourceParticipantRoleEnum("role").notNull().default("unknown"),
    relationshipId: uuid("relationship_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("source_participants_file_id_idx").on(t.fileId),
    uniqueIndex("source_participants_file_label_uq").on(t.fileId, t.rawLabel),
  ],
);

export const sourceThreads = pgTable(
  "source_threads",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("source_threads_file_id_idx").on(t.fileId),
    uniqueIndex("source_threads_file_uq").on(t.fileId),
  ],
);

export const sourceMessages = pgTable(
  "source_messages",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => sourceThreads.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => sourceParticipants.id, {
      onDelete: "set null",
    }),
    kind: sourceMessageKindEnum("kind").notNull().default("speech"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    body: text("body").notNull(),
    bodyHash: text("body_hash").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("source_messages_thread_sent_at_idx").on(t.threadId, t.sentAt),
    uniqueIndex("source_messages_dedupe_uq").on(
      t.threadId,
      t.bodyHash,
      t.sentAt,
      t.participantId,
    ),
  ],
);
