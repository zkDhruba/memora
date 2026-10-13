CREATE TYPE "public"."processing_job_stage" AS ENUM('parse', 'extract', 'embed', 'purge', 'test_fail');--> statement-breakpoint
CREATE TYPE "public"."processing_job_status" AS ENUM('pending', 'active', 'completed', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"file_version_id" uuid NOT NULL,
	"stage" "processing_job_stage" NOT NULL,
	"generation" integer NOT NULL,
	"status" "processing_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"bullmq_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_file_version_id_source_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."source_file_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "processing_jobs_version_stage_generation_uq" ON "processing_jobs" USING btree ("file_version_id","stage","generation");--> statement-breakpoint
CREATE INDEX "processing_jobs_persona_status_idx" ON "processing_jobs" USING btree ("persona_id","status");