CREATE TYPE "public"."chunk_sensitivity" AS ENUM('general', 'sensitive', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."chunk_source_kind" AS ENUM('chat', 'journal', 'prose', 'owner_note', 'email');--> statement-breakpoint
CREATE TYPE "public"."chunk_speaker_role" AS ENUM('subject', 'other', 'unknown', 'document');--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"document_id" uuid,
	"thread_id" uuid,
	"message_start" integer,
	"message_end" integer,
	"source_kind" "chunk_source_kind" NOT NULL,
	"header" text,
	"content" text NOT NULL,
	"content_tsv" "tsvector",
	"speaker_role" "chunk_speaker_role" NOT NULL,
	"audience" "membership_audience" DEFAULT 'private' NOT NULL,
	"sensitivity" "chunk_sensitivity" DEFAULT 'general' NOT NULL,
	"time_start" timestamp with time zone,
	"time_end" timestamp with time zone,
	"retrieval_allowed" boolean DEFAULT false NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_file_version_id_source_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."source_file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_thread_id_source_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."source_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunks_persona_id_idx" ON "document_chunks" USING btree ("persona_id");--> statement-breakpoint
CREATE INDEX "document_chunks_file_id_idx" ON "document_chunks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_retrieval_idx" ON "document_chunks" USING btree ("persona_id","retrieval_allowed","speaker_role");--> statement-breakpoint
CREATE INDEX "document_chunks_content_tsv_idx" ON "document_chunks" USING gin ("content_tsv");