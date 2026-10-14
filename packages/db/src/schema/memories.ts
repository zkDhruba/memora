import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  knowledgeClassEnum,
  membershipAudienceEnum,
  memoryDomainEnum,
  memoryOriginEnum,
  memorySensitivityEnum,
  memoryStatusEnum,
  memoryTypeEnum,
  timePrecisionEnum,
} from "./enums";
import { conversationSessions } from "./conversations";
import { documentChunks } from "./chunks";
import { personas } from "./personas";
import { sourceMessages } from "./chat-sources";

/**
 * Biographical vs conversational memories (docs/08).
 * Check: biographical ⇒ no session; conversational ⇒ session required.
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    domain: memoryDomainEnum("domain").notNull(),
    memoryType: memoryTypeEnum("memory_type").notNull(),
    text: text("text").notNull(),
    timeStart: timestamp("time_start", { withTimezone: true }),
    timeEnd: timestamp("time_end", { withTimezone: true }),
    timePrecision: timePrecisionEnum("time_precision")
      .notNull()
      .default("unknown"),
    status: memoryStatusEnum("status").notNull().default("pending_review"),
    knowledgeClass: knowledgeClassEnum("knowledge_class").notNull(),
    confidence: doublePrecision("confidence").notNull().default(0),
    audience: membershipAudienceEnum("audience").notNull().default("private"),
    origin: memoryOriginEnum("origin").notNull(),
    sensitivity: memorySensitivityEnum("sensitivity").notNull().default("none"),
    conversationSessionId: uuid("conversation_session_id").references(
      () => conversationSessions.id,
      { onDelete: "cascade" },
    ),
    supersedesId: uuid("supersedes_id"),
    hasConflict: boolean("has_conflict").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("memories_persona_domain_status_idx").on(
      t.personaId,
      t.domain,
      t.status,
    ),
    check(
      "memories_domain_session_check",
      sql`(
        (${t.domain} = 'biographical' AND ${t.conversationSessionId} IS NULL)
        OR
        (${t.domain} = 'conversational' AND ${t.conversationSessionId} IS NOT NULL)
      )`,
    ),
  ],
);

export const memoryEvidence = pgTable(
  "memory_evidence",
  {
    id: uuid("id").primaryKey(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => sourceMessages.id, {
      onDelete: "set null",
    }),
    quote: text("quote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("memory_evidence_memory_id_idx").on(t.memoryId)],
);
