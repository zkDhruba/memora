import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { attestationKindEnum, attestationStatusEnum } from "./enums";
import { personas } from "./personas";

export const authorizationAttestations = pgTable(
  "authorization_attestations",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    kind: attestationKindEnum("kind").notNull(),
    statement: text("statement").notNull(),
    evidenceNote: text("evidence_note"),
    status: attestationStatusEnum("status").notNull().default("declared"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("authorization_attestations_persona_idx").on(t.personaId)],
);
