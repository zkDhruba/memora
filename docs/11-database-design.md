# 11 — Database design

Related: [08-memory-system.md](08-memory-system.md), [09-rag-pipeline.md](09-rag-pipeline.md), [diagrams/06-er-diagram.md](diagrams/06-er-diagram.md).

PostgreSQL 18 is the system of record. Redis is queues and rate limits. Object storage is bytes. This schema is the one to implement; do not add the unused candidate tables from the brief.

## Conventions

- Primary keys: `uuid` v7 generated in the application so order is roughly time-sortable.
- Timestamps: `timestamptz`, `created_at` and `updated_at`.
- Soft delete: `deleted_at` only on user-facing aggregates that may be restored for 14 days (`personas`, `conversation_sessions`). Derived content is hard-deleted on purge. After the grace period a job clears bytes and personal columns.
- Persona content tables include `persona_id uuid not null` with an index leading column.
- JSONB only where the shape is genuinely variable (`compiled_card`, `parse_report`, `provider_settings`). Traits and memories are columns and child tables, not one blob.
- Enums as Postgres enums for stable sets (`memory_domain`, `membership_role`) and text checks for sets that will grow (`sensitivity`).

## Tenancy and RLS

Enable RLS on every table that has `persona_id`. Policy: `persona_id = any (current_setting('app.persona_ids')::uuid[])`. The application role is not `BYPASSRLS`. Migrations run as a separate role.

Users, sessions, and platform audit rows are not persona-scoped. Access to those is application-level.

RLS will not express "audience = family." That stays in the repository where the membership is known. RLS stops cross-persona leaks. Audience stops intra-persona leaks.

## Tables

### Identity

**users** — `id`, `email` unique, `password_hash`, `email_verified_at`, `display_name`, `locale`, `time_zone`, `platform_role` (`member`, `admin`), `disabled_at`, timestamps.

**sessions** — `id`, `user_id` FK, `token_hash` unique, `user_agent`, `ip_prefix` (masked, not full IP), `expires_at`, `revoked_at`, `last_seen_at`.

**mfa_factors** — `id`, `user_id`, `type` (`totp`), `secret_encrypted`, `confirmed_at`.

**recovery_codes** — `user_id`, `code_hash`, `used_at`.

**audit_logs** — `id`, `actor_user_id` null, `persona_id` null, `action`, `target_type`, `target_id`, `metadata` jsonb, `created_at`. No update or delete grants for the application role.

### Persona and consent

**personas** — `id`, `scenario` (`living`, `legacy`), `status` (`draft`, `collecting`, `ready`, `suspended`, `deleting`), `display_name`, `alternate_names` text[], `biography`, `languages` text[], `birth_year`, `death_year`, `profile_object_key`, `readiness` jsonb, `provider_key` (allowlisted provider id), `deleted_at`.

**persona_memberships** — `persona_id`, `user_id`, `role` (`owner`, `manager`, `contributor`, `participant`), `audience` (`private`, `family`, `friend`, `colleague`, `any`), unique `(persona_id, user_id)`.

**consents** — `id`, `persona_id`, `user_id`, `purpose` (`host_records`, `send_to_provider`, `extract_profile`, `converse`), `provider_key` null, `statement_version`, `granted_at`, `revoked_at`. Unique active consent per `(persona_id, purpose, provider_key)` where `revoked_at` is null.

**consent_events** — append-only changes to consents.

**authorization_attestations** — `persona_id`, `kind` (`self`, `representative`), `statement`, `evidence_note`, `status` (`declared`, `disputed`).

**trusted_contacts** — `persona_id`, `email`, `purpose` (`suspend`, `legacy_request`), `confirmed_at`.

### Sources

**source_imports** — `id`, `persona_id`, `created_by`, `status`, `file_count`.

**source_files** — `id`, `persona_id`, `import_id`, `original_filename`, `media_type`, `byte_size`, `sha256`, `object_key`, `status` (`uploaded`, `clean`, `infected`, `parsed`, `needs_attention`, `ready`, `deleting`, `deleted`), `subject_participant_id` null, unique `(persona_id, sha256)` where status not deleted.

**source_file_versions** — `id`, `file_id`, `generation`, `object_key`, `parse_report` jsonb. Reprocess writes a version.

**source_participants** — `id`, `persona_id`, `file_id`, `raw_label`, `role` (`subject`, `other`, `unknown`), `relationship_id` null.

**source_threads** — `id`, `persona_id`, `file_id`, `title`.

**source_messages** — `id`, `persona_id`, `thread_id`, `participant_id`, `sent_at`, `body`, `body_hash`, `position`. Unique `(thread_id, body_hash, sent_at, participant_id)`.

**documents** — parsed non-chat texts: `id`, `persona_id`, `file_version_id`, `kind`, `language`, `text_object_key` (large text) or `text` if small. Prefer object storage above 100 KB and keep a preview column.

**document_chunks** — `id`, `persona_id`, `document_id` null, `message_range` int4range null, `content`, `content_tsv` tsvector, `speaker_role`, `audience`, `sensitivity`, `time_start`, `time_end`, `retrieval_allowed` boolean, `token_count`.

**chunk_embeddings** — `chunk_id`, `model`, `dims`, `embedding vector(1536)`. Primary key `(chunk_id, model)`. Index HNSW cosine on `embedding`.

**processing_jobs** — `id`, `persona_id`, `file_version_id`, `stage`, `generation`, `status`, `attempts`, `error_code`, `bullmq_job_id`. Unique `(file_version_id, stage, generation)`.

### Personality and people

**personality_profiles** — `persona_id` PK, `version`, `compiled_card` jsonb, `updated_at`.

**personality_profile_versions** — `persona_id`, `version`, `compiled_card`, `created_at`.

**personality_traits** — columns in [07-personality-engine.md](07-personality-engine.md). Index `(persona_id, status)`.

**personality_evidence** — `trait_id`, `message_id` null, `chunk_id` null, `quote`. Check that one target is present.

**relationships** — `id`, `persona_id`, `display_name`, `kind` (`spouse`, `child`, `parent`, `sibling`, `friend`, `colleague`, `other`), `nickname_used_by_subject`, `notes`, `status`.

**relationship_claims** — `id`, `relationship_id`, `claimant_user_id`, `status` (`pending`, `approved`, `rejected`).

### Memories

**memories** — fields in [08-memory-system.md](08-memory-system.md). Check constraint: domain `conversational` implies `conversation_session_id` is not null; domain `biographical` implies it is null. Index `(persona_id, domain, status)`.

**memory_embeddings** — same pattern as chunk embeddings.

**memory_evidence** — `memory_id`, `chunk_id` null, `message_id` null, `quote`.

**memory_conflicts** — `id`, `persona_id`, `left_memory_id`, `right_memory_id`, `status` (`open`, `resolved`).

### Conversation

**conversation_sessions** — `id`, `persona_id`, `user_id`, `title`, `summary`, `deleted_at`.

**conversation_messages** — `id`, `session_id`, `persona_id`, `role` (`user`, `assistant`, `system`), `content`, `status`, `model`, `quality`, `created_at`.

**message_citations** — `message_id`, `chunk_id` null, `memory_id` null, `marker`.

**message_feedback** — `message_id`, `user_id`, `rating`, `note`.

Conversational memories live in `memories` with `domain = conversational`. No second memory table.

### Operations

**usage_records** — `persona_id`, `user_id`, `purpose`, `provider`, `model`, `input_tokens`, `output_tokens`, `created_at`.

**evaluation_runs** and **evaluation_cases** — Phase 4. See [17-testing-evaluation.md](17-testing-evaluation.md).

**voice_profiles** — Phase 5: `persona_id`, `status`, `consent_id`, `provider_voice_ref`. No raw biometric template in Postgres if the provider stores the voice; store only the reference and the consent id.

## Indexes to create with the MVP migration

- `users(email)` unique.
- `sessions(token_hash)` unique, `sessions(user_id)`.
- `persona_memberships(user_id)`.
- `source_files(persona_id, status)`.
- `source_messages(thread_id, sent_at)`.
- `document_chunks` GIN on `content_tsv`.
- HNSW on both embedding tables.
- `conversation_messages(session_id, created_at)`.
- `audit_logs(persona_id, created_at)` and `audit_logs(actor_user_id, created_at)`.
- `usage_records(persona_id, created_at)`.

## Migration strategy

Drizzle Kit SQL migrations in `packages/db`. Every migration is forward-only. Expansion before contraction: add a column, backfill in a job, then switch reads, then drop. Vector dimension changes are new columns, not alters, because `vector(1536)` is fixed.

Seed script creates an admin user only when `SEED_ADMIN_EMAIL` is set.

## Retention

| Data | Default |
| --- | --- |
| Account and persona | Until deletion request, then 14-day restore window |
| Infected files | Delete object within 24 hours |
| Dead-letter job payloads | 30 days |
| Audit logs | 24 months, metadata only |
| Chat | Until the user deletes the session |
| Backups | 30 days, encrypted, then expire |

Retention is a product default. Counsel may require shorter periods for sensitive categories.

## What not to put in Postgres

File bytes, ClamAV signatures, rate-limit counters, the compiled prompt cache (provider-side), and websocket presence.
