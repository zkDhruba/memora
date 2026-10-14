import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  conversationMessageRoleEnum,
  conversationMessageStatusEnum,
  messageQualityEnum,
} from "./enums";
import { personas } from "./personas";
import { users } from "./users";

/** Chat sessions (needed so conversational memories can FK a session). */
export const conversationSessions = pgTable(
  "conversation_sessions",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    summary: text("summary"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversation_sessions_persona_user_idx").on(t.personaId, t.userId),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => conversationSessions.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    role: conversationMessageRoleEnum("role").notNull(),
    content: text("content").notNull().default(""),
    status: conversationMessageStatusEnum("status")
      .notNull()
      .default("complete"),
    model: text("model"),
    quality: messageQualityEnum("quality"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversation_messages_session_created_idx").on(
      t.sessionId,
      t.createdAt,
    ),
  ],
);
