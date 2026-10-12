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
