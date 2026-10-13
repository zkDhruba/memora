CREATE TYPE "public"."attestation_kind" AS ENUM('self', 'representative');--> statement-breakpoint
CREATE TYPE "public"."attestation_status" AS ENUM('declared', 'disputed');--> statement-breakpoint
CREATE TABLE "authorization_attestations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"kind" "attestation_kind" NOT NULL,
	"statement" text NOT NULL,
	"evidence_note" text,
	"status" "attestation_status" DEFAULT 'declared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorization_attestations" ADD CONSTRAINT "authorization_attestations_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authorization_attestations_persona_idx" ON "authorization_attestations" USING btree ("persona_id");