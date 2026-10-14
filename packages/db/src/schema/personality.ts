import {
  doublePrecision,
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
  knowledgeClassEnum,
  membershipAudienceEnum,
  traitFacetEnum,
  traitPolarityEnum,
  traitStatusEnum,
} from "./enums";
import { documentChunks } from "./chunks";
import { personas } from "./personas";
import { sourceMessages } from "./chat-sources";

/** One active compiled style card per persona (docs/07). */
export const personalityProfiles = pgTable("personality_profiles", {
  personaId: uuid("persona_id")
    .primaryKey()
    .references(() => personas.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  compiledCard: jsonb("compiled_card")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** Deterministic corpus stats (class B measurements). */
  styleStats: jsonb("style_stats")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const personalityProfileVersions = pgTable(
  "personality_profile_versions",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    compiledCard: jsonb("compiled_card")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("personality_profile_versions_persona_version_uq").on(
      t.personaId,
      t.version,
    ),
  ],
);

export const personalityTraits = pgTable(
  "personality_traits",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    facet: traitFacetEnum("facet").notNull(),
    value: text("value").notNull(),
    knowledgeClass: knowledgeClassEnum("knowledge_class").notNull(),
    status: traitStatusEnum("status").notNull().default("pending_review"),
    confidence: doublePrecision("confidence").notNull().default(0),
    audience: membershipAudienceEnum("audience").notNull().default("any"),
    polarity: traitPolarityEnum("polarity").notNull().default("observed"),
    profileVersion: integer("profile_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("personality_traits_persona_status_idx").on(t.personaId, t.status),
  ],
);

export const personalityEvidence = pgTable(
  "personality_evidence",
  {
    id: uuid("id").primaryKey(),
    traitId: uuid("trait_id")
      .notNull()
      .references(() => personalityTraits.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => sourceMessages.id, {
      onDelete: "set null",
    }),
    chunkId: uuid("chunk_id").references(() => documentChunks.id, {
      onDelete: "set null",
    }),
    quote: text("quote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("personality_evidence_trait_id_idx").on(t.traitId)],
);
