CREATE TYPE "public"."knowledge_class" AS ENUM('A', 'B', 'C', 'D', 'E');--> statement-breakpoint
CREATE TYPE "public"."trait_facet" AS ENUM('formality', 'sentence_length', 'lexicon', 'greeting', 'farewell', 'humor', 'emotion', 'habit', 'interest_expression', 'storytelling', 'code_switching', 'address_term');--> statement-breakpoint
CREATE TYPE "public"."trait_polarity" AS ENUM('observed', 'owner_requested');--> statement-breakpoint
CREATE TYPE "public"."trait_status" AS ENUM('pending_review', 'confirmed', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "personality_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trait_id" uuid NOT NULL,
	"message_id" uuid,
	"chunk_id" uuid,
	"quote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_profile_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"compiled_card" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_profiles" (
	"persona_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"compiled_card" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"style_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_traits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"facet" "trait_facet" NOT NULL,
	"value" text NOT NULL,
	"knowledge_class" "knowledge_class" NOT NULL,
	"status" "trait_status" DEFAULT 'pending_review' NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"audience" "membership_audience" DEFAULT 'any' NOT NULL,
	"polarity" "trait_polarity" DEFAULT 'observed' NOT NULL,
	"profile_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personality_evidence" ADD CONSTRAINT "personality_evidence_trait_id_personality_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."personality_traits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_evidence" ADD CONSTRAINT "personality_evidence_message_id_source_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."source_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_evidence" ADD CONSTRAINT "personality_evidence_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_profile_versions" ADD CONSTRAINT "personality_profile_versions_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_profiles" ADD CONSTRAINT "personality_profiles_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_traits" ADD CONSTRAINT "personality_traits_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personality_evidence_trait_id_idx" ON "personality_evidence" USING btree ("trait_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personality_profile_versions_persona_version_uq" ON "personality_profile_versions" USING btree ("persona_id","version");--> statement-breakpoint
CREATE INDEX "personality_traits_persona_status_idx" ON "personality_traits" USING btree ("persona_id","status");