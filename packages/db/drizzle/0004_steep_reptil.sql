CREATE TYPE "public"."document_kind" AS ENUM('plain_text', 'markdown', 'prose', 'journal', 'biography', 'owner_note', 'csv_dump');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"language" text DEFAULT 'und' NOT NULL,
	"text" text,
	"text_object_key" text,
	"preview" text,
	"char_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_version_id_source_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."source_file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_persona_id_idx" ON "documents" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_file_version_uq" ON "documents" USING btree ("file_version_id");