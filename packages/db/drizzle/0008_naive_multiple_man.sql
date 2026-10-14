CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "chunk_embeddings" (
	"chunk_id" uuid NOT NULL,
	"model" text NOT NULL,
	"dims" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_embeddings_chunk_id_model_pk" PRIMARY KEY("chunk_id","model")
);
--> statement-breakpoint
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunk_embeddings_hnsw_idx" ON "chunk_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);