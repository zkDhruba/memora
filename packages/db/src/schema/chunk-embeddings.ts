import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { documentChunks } from "./chunks";

/**
 * Per-chunk embedding vectors (docs/11). PK (chunk_id, model) allows
 * dual-model backfill without dropping the first model.
 */
export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    dims: integer("dims").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.chunkId, t.model] }),
    index("chunk_embeddings_hnsw_idx").using(
      "hnsw",
      sql`${t.embedding} vector_cosine_ops`,
    ),
  ],
);
