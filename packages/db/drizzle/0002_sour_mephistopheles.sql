CREATE TYPE "public"."source_file_status" AS ENUM('pending_upload', 'uploaded', 'clean', 'infected', 'parsed', 'needs_attention', 'ready', 'deleting', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."source_import_status" AS ENUM('open', 'closed', 'failed');--> statement-breakpoint
CREATE TABLE "source_file_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"object_key" text NOT NULL,
	"bucket" text NOT NULL,
	"parse_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text,
	"object_key" text NOT NULL,
	"bucket" text NOT NULL,
	"status" "source_file_status" DEFAULT 'pending_upload' NOT NULL,
	"subject_participant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"status" "source_import_status" DEFAULT 'open' NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_file_versions" ADD CONSTRAINT "source_file_versions_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_import_id_source_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."source_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_imports" ADD CONSTRAINT "source_imports_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_imports" ADD CONSTRAINT "source_imports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_file_versions_file_generation_uq" ON "source_file_versions" USING btree ("file_id","generation");--> statement-breakpoint
CREATE INDEX "source_files_persona_status_idx" ON "source_files" USING btree ("persona_id","status");--> statement-breakpoint
CREATE INDEX "source_files_import_id_idx" ON "source_files" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_files_persona_sha256_uq" ON "source_files" USING btree ("persona_id","sha256") WHERE "source_files"."sha256" is not null and "source_files"."status" not in ('deleted', 'deleting');--> statement-breakpoint
CREATE INDEX "source_imports_persona_id_idx" ON "source_imports" USING btree ("persona_id");