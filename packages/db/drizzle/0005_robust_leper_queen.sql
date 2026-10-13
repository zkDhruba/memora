CREATE TYPE "public"."source_message_kind" AS ENUM('speech', 'system');--> statement-breakpoint
CREATE TYPE "public"."source_participant_role" AS ENUM('subject', 'other', 'unknown');--> statement-breakpoint
CREATE TABLE "source_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"participant_id" uuid,
	"kind" "source_message_kind" DEFAULT 'speech' NOT NULL,
	"sent_at" timestamp with time zone,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"raw_label" text NOT NULL,
	"role" "source_participant_role" DEFAULT 'unknown' NOT NULL,
	"relationship_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_thread_id_source_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."source_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_messages" ADD CONSTRAINT "source_messages_participant_id_source_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."source_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_participants" ADD CONSTRAINT "source_participants_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_participants" ADD CONSTRAINT "source_participants_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_threads" ADD CONSTRAINT "source_threads_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_threads" ADD CONSTRAINT "source_threads_file_id_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_messages_thread_sent_at_idx" ON "source_messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_messages_dedupe_uq" ON "source_messages" USING btree ("thread_id","body_hash","sent_at","participant_id");--> statement-breakpoint
CREATE INDEX "source_participants_file_id_idx" ON "source_participants" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_participants_file_label_uq" ON "source_participants" USING btree ("file_id","raw_label");--> statement-breakpoint
CREATE INDEX "source_threads_file_id_idx" ON "source_threads" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_threads_file_uq" ON "source_threads" USING btree ("file_id");