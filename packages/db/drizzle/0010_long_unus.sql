CREATE TYPE "public"."memory_domain" AS ENUM('biographical', 'conversational');--> statement-breakpoint
CREATE TYPE "public"."memory_origin" AS ENUM('extracted', 'owner_entered', 'conversation');--> statement-breakpoint
CREATE TYPE "public"."memory_sensitivity" AS ENUM('none', 'health', 'belief', 'minor', 'financial', 'other');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('pending_review', 'confirmed', 'rejected', 'superseded', 'conflict', 'retracted');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('semantic', 'episodic', 'autobiographical', 'relationship', 'temporal', 'session_fact', 'session_preference');--> statement-breakpoint
CREATE TYPE "public"."time_precision" AS ENUM('day', 'month', 'year', 'approximate', 'unknown');--> statement-breakpoint
CREATE TABLE "conversation_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text,
	"summary" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"domain" "memory_domain" NOT NULL,
	"memory_type" "memory_type" NOT NULL,
	"text" text NOT NULL,
	"time_start" timestamp with time zone,
	"time_end" timestamp with time zone,
	"time_precision" time_precision DEFAULT 'unknown' NOT NULL,
	"status" "memory_status" DEFAULT 'pending_review' NOT NULL,
	"knowledge_class" "knowledge_class" NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"audience" "membership_audience" DEFAULT 'private' NOT NULL,
	"origin" "memory_origin" NOT NULL,
	"sensitivity" "memory_sensitivity" DEFAULT 'none' NOT NULL,
	"conversation_session_id" uuid,
	"supersedes_id" uuid,
	"has_conflict" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memories_domain_session_check" CHECK ((
        ("memories"."domain" = 'biographical' AND "memories"."conversation_session_id" IS NULL)
        OR
        ("memories"."domain" = 'conversational' AND "memories"."conversation_session_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "memory_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"memory_id" uuid NOT NULL,
	"chunk_id" uuid,
	"message_id" uuid,
	"quote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_conversation_session_id_conversation_sessions_id_fk" FOREIGN KEY ("conversation_session_id") REFERENCES "public"."conversation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_evidence" ADD CONSTRAINT "memory_evidence_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_evidence" ADD CONSTRAINT "memory_evidence_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_evidence" ADD CONSTRAINT "memory_evidence_message_id_source_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."source_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_sessions_persona_user_idx" ON "conversation_sessions" USING btree ("persona_id","user_id");--> statement-breakpoint
CREATE INDEX "memories_persona_domain_status_idx" ON "memories" USING btree ("persona_id","domain","status");--> statement-breakpoint
CREATE INDEX "memory_evidence_memory_id_idx" ON "memory_evidence" USING btree ("memory_id");