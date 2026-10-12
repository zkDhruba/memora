import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  membershipAudienceEnum,
  membershipRoleEnum,
  personaScenarioEnum,
  personaStatusEnum,
} from "./enums";
import { users } from "./users";

export const personas = pgTable(
  "personas",
  {
    id: uuid("id").primaryKey(),
    scenario: personaScenarioEnum("scenario").notNull(),
    status: personaStatusEnum("status").notNull().default("draft"),
    displayName: text("display_name").notNull(),
    alternateNames: text("alternate_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    biography: text("biography"),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    birthYear: integer("birth_year"),
    deathYear: integer("death_year"),
    profileObjectKey: text("profile_object_key"),
    readiness: jsonb("readiness")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerKey: text("provider_key"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("personas_created_by_idx").on(t.createdByUserId)],
);

export const personaMemberships = pgTable(
  "persona_memberships",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    audience: membershipAudienceEnum("audience").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("persona_memberships_persona_user_uq").on(
      t.personaId,
      t.userId,
    ),
    index("persona_memberships_user_id_idx").on(t.userId),
    index("persona_memberships_owner_user_idx")
      .on(t.userId)
      .where(sql`${t.role} = 'owner'`),
  ],
);
