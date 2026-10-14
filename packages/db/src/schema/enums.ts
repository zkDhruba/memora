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

export const documentKindEnum = pgEnum("document_kind", [
  "plain_text",
  "markdown",
  "prose",
  "journal",
  "biography",
  "owner_note",
  "csv_dump",
]);

export const sourceParticipantRoleEnum = pgEnum("source_participant_role", [
  "subject",
  "other",
  "unknown",
]);

export const sourceMessageKindEnum = pgEnum("source_message_kind", [
  "speech",
  "system",
]);

export const chunkSpeakerRoleEnum = pgEnum("chunk_speaker_role", [
  "subject",
  "other",
  "unknown",
  "document",
]);

export const chunkSensitivityEnum = pgEnum("chunk_sensitivity", [
  "general",
  "sensitive",
  "restricted",
]);

export const chunkSourceKindEnum = pgEnum("chunk_source_kind", [
  "chat",
  "journal",
  "prose",
  "owner_note",
  "email",
]);

export const traitFacetEnum = pgEnum("trait_facet", [
  "formality",
  "sentence_length",
  "lexicon",
  "greeting",
  "farewell",
  "humor",
  "emotion",
  "habit",
  "interest_expression",
  "storytelling",
  "code_switching",
  "address_term",
]);

export const knowledgeClassEnum = pgEnum("knowledge_class", [
  "A",
  "B",
  "C",
  "D",
  "E",
]);

export const traitStatusEnum = pgEnum("trait_status", [
  "pending_review",
  "confirmed",
  "rejected",
  "superseded",
]);

export const traitPolarityEnum = pgEnum("trait_polarity", [
  "observed",
  "owner_requested",
]);

export const memoryDomainEnum = pgEnum("memory_domain", [
  "biographical",
  "conversational",
]);

export const memoryTypeEnum = pgEnum("memory_type", [
  "semantic",
  "episodic",
  "autobiographical",
  "relationship",
  "temporal",
  "session_fact",
  "session_preference",
]);

export const memoryStatusEnum = pgEnum("memory_status", [
  "pending_review",
  "confirmed",
  "rejected",
  "superseded",
  "conflict",
  "retracted",
]);

export const memoryOriginEnum = pgEnum("memory_origin", [
  "extracted",
  "owner_entered",
  "conversation",
]);

export const memorySensitivityEnum = pgEnum("memory_sensitivity", [
  "none",
  "health",
  "belief",
  "minor",
  "financial",
  "other",
]);

export const timePrecisionEnum = pgEnum("time_precision", [
  "day",
  "month",
  "year",
  "approximate",
  "unknown",
]);
