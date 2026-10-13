import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { documentKindEnum } from "./enums";
import { personas } from "./personas";
import { sourceFileVersions } from "./sources";

/**
 * Parsed non-chat text from a file version.
 * Small bodies live in `text`; larger ones use `textObjectKey` + `preview`.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => sourceFileVersions.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull(),
    language: text("language").notNull().default("und"),
    text: text("text"),
    textObjectKey: text("text_object_key"),
    preview: text("preview"),
    charCount: integer("char_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("documents_persona_id_idx").on(t.personaId),
    uniqueIndex("documents_file_version_uq").on(t.fileVersionId),
  ],
);
