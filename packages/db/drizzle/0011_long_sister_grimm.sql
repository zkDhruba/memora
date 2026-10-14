CREATE TYPE "public"."conversation_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."conversation_message_status" AS ENUM('pending', 'streaming', 'complete', 'aborted', 'error');--> statement-breakpoint
CREATE TYPE "public"."message_quality" AS ENUM('ok', 'degraded', 'abstained');--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	"role" "conversation_message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "conversation_message_status" DEFAULT 'complete' NOT NULL,
	"model" text,
	"quality" "message_quality",
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_citations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"chunk_id" uuid,
	"memory_id" uuid,
	"marker" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_conversation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."conversation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_session_created_idx" ON "conversation_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "message_citations_message_id_idx" ON "message_citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_feedback_message_id_idx" ON "message_feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "usage_records_persona_created_idx" ON "usage_records" USING btree ("persona_id","created_at");