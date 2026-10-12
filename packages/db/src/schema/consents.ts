import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { consentPurposeEnum } from "./enums";
import { personas } from "./personas";
import { users } from "./users";

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    purpose: consentPurposeEnum("purpose").notNull(),
    providerKey: text("provider_key"),
    statementVersion: text("statement_version").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("consents_persona_id_idx").on(t.personaId),
    // COALESCE so null provider_key collides with '' (one active row per purpose).
    uniqueIndex("consents_active_uq")
      .on(t.personaId, t.purpose, sql`coalesce(${t.providerKey}, '')`)
      .where(sql`${t.revokedAt} is null`),
  ],
);
