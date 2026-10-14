import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { documentChunks } from "./chunks";
import { conversationMessages } from "./conversations";
import { memories } from "./memories";
import { personas } from "./personas";
import { users } from "./users";

export const messageCitations = pgTable(
  "message_citations",
  {
    id: uuid("id").primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id, {
      onDelete: "set null",
    }),
    memoryId: uuid("memory_id").references(() => memories.id, {
      onDelete: "set null",
    }),
    marker: text("marker").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("message_citations_message_id_idx").on(t.messageId)],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    messageId: uuid("message_id").references(() => conversationMessages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_records_persona_created_idx").on(t.personaId, t.createdAt),
  ],
);

export const messageFeedback = pgTable(
  "message_feedback",
  {
    id: uuid("id").primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: doublePrecision("rating").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("message_feedback_message_id_idx").on(t.messageId)],
);
