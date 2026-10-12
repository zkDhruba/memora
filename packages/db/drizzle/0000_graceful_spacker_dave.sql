CREATE TYPE "public"."consent_purpose" AS ENUM('host_records', 'send_to_provider', 'extract_profile', 'converse');--> statement-breakpoint
CREATE TYPE "public"."membership_audience" AS ENUM('private', 'family', 'friend', 'colleague', 'any');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'manager', 'contributor', 'participant');--> statement-breakpoint
CREATE TYPE "public"."mfa_factor_type" AS ENUM('totp');--> statement-breakpoint
CREATE TYPE "public"."persona_scenario" AS ENUM('living', 'legacy');--> statement-breakpoint
CREATE TYPE "public"."persona_status" AS ENUM('draft', 'collecting', 'ready', 'suspended', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"platform_role" "platform_role" DEFAULT 'member' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_prefix" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_factors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "mfa_factor_type" DEFAULT 'totp' NOT NULL,
	"secret_encrypted" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"persona_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"limits" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"override_max_personas" integer,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persona_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"audience" "membership_audience" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scenario" "persona_scenario" NOT NULL,
	"status" "persona_status" DEFAULT 'draft' NOT NULL,
	"display_name" text NOT NULL,
	"alternate_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"biography" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"birth_year" integer,
	"death_year" integer,
	"profile_object_key" text,
	"readiness" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_key" text,
	"created_by_user_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"persona_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"provider_key" text,
	"statement_version" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_memberships" ADD CONSTRAINT "persona_memberships_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_memberships" ADD CONSTRAINT "persona_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mfa_factors_user_id_idx" ON "mfa_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_persona_created_idx" ON "audit_logs" USING btree ("persona_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "persona_memberships_persona_user_uq" ON "persona_memberships" USING btree ("persona_id","user_id");--> statement-breakpoint
CREATE INDEX "persona_memberships_user_id_idx" ON "persona_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "persona_memberships_owner_user_idx" ON "persona_memberships" USING btree ("user_id") WHERE "persona_memberships"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "personas_created_by_idx" ON "personas" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "consents_persona_id_idx" ON "consents" USING btree ("persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_active_uq" ON "consents" USING btree ("persona_id","purpose",coalesce("provider_key", '')) WHERE "consents"."revoked_at" is null;--> statement-breakpoint
-- RLS: cross-persona isolation (app sets app.persona_ids). Superuser bypasses locally.
ALTER TABLE "personas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "persona_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "personas_tenant" ON "personas"
  FOR ALL
  USING (
    "id" = ANY (
      COALESCE(
        NULLIF(current_setting('app.persona_ids', true), '')::uuid[],
        '{}'::uuid[]
      )
    )
  )
  WITH CHECK (
    "id" = ANY (
      COALESCE(
        NULLIF(current_setting('app.persona_ids', true), '')::uuid[],
        '{}'::uuid[]
      )
    )
  );--> statement-breakpoint
CREATE POLICY "persona_memberships_tenant" ON "persona_memberships"
  FOR ALL
  USING (
    "persona_id" = ANY (
      COALESCE(
        NULLIF(current_setting('app.persona_ids', true), '')::uuid[],
        '{}'::uuid[]
      )
    )
  )
  WITH CHECK (
    "persona_id" = ANY (
      COALESCE(
        NULLIF(current_setting('app.persona_ids', true), '')::uuid[],
        '{}'::uuid[]
      )
    )
  );--> statement-breakpoint
CREATE POLICY "consents_tenant" ON "consents"
  FOR ALL
  USING (
    "persona_id" = ANY (
      COALESCE(
        NULLIF(current_setting('app.persona_ids', true), '')::uuid[],
        '{}'::uuid[]
      )
    )
  )
  WITH CHECK (
    "persona_id" = ANY (
      COALESCE(
        NULLIF(current_setting('app.persona_ids', true), '')::uuid[],
        '{}'::uuid[]
      )
    )
  );