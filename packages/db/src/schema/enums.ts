import { pgEnum } from "drizzle-orm/pg-core";

export const platformRoleEnum = pgEnum("platform_role", ["member", "admin"]);

export const mfaFactorTypeEnum = pgEnum("mfa_factor_type", ["totp"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
]);

export const personaScenarioEnum = pgEnum("persona_scenario", [
  "living",
  "legacy",
]);

export const personaStatusEnum = pgEnum("persona_status", [
  "draft",
  "collecting",
  "ready",
  "suspended",
  "deleting",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "manager",
  "contributor",
  "participant",
]);

export const membershipAudienceEnum = pgEnum("membership_audience", [
  "private",
  "family",
  "friend",
  "colleague",
  "any",
]);

export const consentPurposeEnum = pgEnum("consent_purpose", [
  "host_records",
  "send_to_provider",
  "extract_profile",
  "converse",
]);

export const attestationKindEnum = pgEnum("attestation_kind", [
  "self",
  "representative",
]);

export const attestationStatusEnum = pgEnum("attestation_status", [
  "declared",
  "disputed",
]);

export const sourceImportStatusEnum = pgEnum("source_import_status", [
  "open",
  "closed",
  "failed",
]);

export const sourceFileStatusEnum = pgEnum("source_file_status", [
  "pending_upload",
  "uploaded",
  "clean",
  "infected",
  "parsed",
  "needs_attention",
  "ready",
  "deleting",
  "deleted",
]);

export const processingJobStatusEnum = pgEnum("processing_job_status", [
  "pending",
  "active",
  "completed",
  "failed",
  "dead",
]);

export const processingJobStageEnum = pgEnum("processing_job_stage", [
  "parse",
  "extract",
  "embed",
  "purge",
  "test_fail",
]);
