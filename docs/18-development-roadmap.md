# 18 — Development roadmap

Related: [PROJECT_PLAN.md](../PROJECT_PLAN.md), [19-implementation-task-breakdown.md](19-implementation-task-breakdown.md).

Estimates are relative: S (days), M (one to two weeks), L (several weeks) for a small team that already knows TypeScript. They are not a staffing quote.

## Phase 0 — Research and architecture

**Status:** complete as this documentation set.

Objectives: lock stack, data model, privacy rules, and eval approach.

Deliverables: `docs/`, `README.md`, `ARCHITECTURE.md`, `PROJECT_PLAN.md`.

Acceptance: a later session can scaffold without revisiting monolith versus microservices, vector database, or agent framework.

Definition of done: documents agree on memory domains, provider allowlist, and MVP boundary.

## Phase 1 — Platform foundation

**Objective:** a signed-in user can create a living persona and see an empty studio.

**Features:** monorepo, auth, MFA, sessions, personas, consent records, audit, dashboard shell, MinIO, Postgres, Redis.

**Depends on:** Phase 0.

**Complexity:** M.

**Tasks:** scaffold pnpm and Turborepo; Drizzle schema for identity, personas, consent; Nest auth; Next auth screens; Docker Compose; health checks.

**Deliverables:** running `pnpm dev`, migrations, login and persona wizard without uploads.

**Acceptance:** verification email in Mailpit; MFA step-up on persona delete; second user cannot read the persona; OpenAPI lists the auth routes.

**Test plan:** Vitest auth service; Playwright register and create persona; RLS test for `personas` if policies are already on.

**Done when:** those tests pass in CI and secrets are only in `.env`.

## Phase 2 — Ingestion MVP

**Objective:** authorized files become traced chunks.

**Features:** presigned upload, ClamAV, text/Markdown/DOCX/PDF/WhatsApp, jobs, progress UI, dedupe, reprocess, purge.

**Depends on:** Phase 1 consent guard.

**Complexity:** L.

**Acceptance:** a WhatsApp fixture yields messages with the subject mapped; a duplicate hash does not double-charge embedding; an EICAR test file is rejected; deleting a file removes chunks.

**Test plan:** parser fixtures; job restart; purge integration test.

**Done when:** no chunk exists without `persona_id` and a file version.

## Phase 3 — Functional AI persona

**Objective:** the smallest usable product.

**Features:** trait and memory extraction with review, embeddings, hybrid retrieval, SSE chat, citations, abstention, disclosure banner, quotas, conversational memories separated by schema.

**Depends on:** Phase 2.

**Complexity:** L.

**Acceptance:** gold-path Playwright with a mocked LLM; real-model smoke optional; sentinel isolation test; must-abstain fixture; user can see sources; a chat fact does not appear in biographical search.

**Test plan:** [17-testing-evaluation.md](17-testing-evaluation.md) MVP bars.

**Done when:** a living owner can complete the journey on a staging VM with a real provider key and a spend cap.

This phase **is the MVP**.

## Phase 4 — Personality, relationships, evaluation

**Objective:** the simulation behaves differently for an approved relationship and the team can regress quality.

**Features:** relationship graph and claims, audience enforcement, conflict review, profile versions, calibration screen, eval harness, Telegram and email parsers, data export.

**Depends on:** Phase 3.

**Complexity:** L.

**Acceptance:** an unapproved "I am the daughter" claim does not change style; a conflict is hidden or labeled; eval job writes a report; export omits other users' conversational memories.

**Done when:** gold set exists for at least one synthetic persona in English and one in Bangla.

## Phase 5 — Multimodal and voice

**Objective:** photos and speech without impersonation by default.

**Features:** image store and confirmed captions, batch transcription, TTS playback, then WebSocket voice, then a gated consent design for synthetic voice. Legacy voice cloning stays off.

**Depends on:** Phase 3. Can overlap Phase 4 only after chat is stable.

**Complexity:** L.

**Acceptance:** synthetic audio is labeled; transcription corrects into the same session; image speculation is not retrievable while unconfirmed; voice feature flag defaults off.

**Done when:** a measured cost per voice minute is written into the runbook.

## Phase 6 — Production hardening

**Objective:** operate without reading private content.

**Features:** admin console, suspension, abuse report, restore drill, OpenTelemetry, load test, consent revocation UX, dispute freeze, backup alerts.

**Depends on:** MVP in real use.

**Complexity:** M.

**Acceptance:** restore drill recorded; admin content test still fails; spend alert fires on a synthetic overrun; p95 retrieval measured.

**Done when:** the single-server runbook is enough for someone other than the author to recover the database.

## Explicitly later

Native mobile apps, public sharing links, fine-tuning, Kubernetes, a second vector database, multi-agent debate, and automatic provider switching.
