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

**Objective:** a signed-in user can CRUD a living persona under Free/Pro/Pro+ caps and see it in Chat.

**Features:** monorepo, auth, MFA, sessions, personas CRUD, plan catalog and subscriptions, consent records, audit, dashboard + chat hub shell, MinIO, Postgres, Redis.

**Depends on:** Phase 0.

**Complexity:** M.

**Tasks:** scaffold pnpm and Turborepo; Drizzle schema for identity, plans, subscriptions, personas, consent; `PlanGuard`; Nest auth; Next auth, dashboard, create wizard, chat picker; Docker Compose; health checks.

**Deliverables:** running `pnpm dev`, migrations, login, persona CRUD without uploads, plan limits enforced, persona visible in Chat after create.

**Acceptance:** verification email in Mailpit; Free user cannot create a second owned persona (`PLAN_LIMIT_PERSONAS`); created persona appears in Chat switcher; MFA step-up on persona delete; second user cannot read the persona; OpenAPI lists the auth and persona routes.

**Test plan:** Vitest auth and PlanGuard; Playwright register, create persona, open Chat hub; RLS test for `personas` if policies are already on.

**Done when:** those tests pass in CI and secrets are only in `.env`.

## Phase 2 — Ingestion MVP

**Objective:** authorized files become traced chunks.

**Features:** presigned upload, ClamAV, text/Markdown/DOCX/PDF/WhatsApp, jobs, progress UI, dedupe, reprocess, purge.

**Depends on:** Phase 1 consent guard.

**Complexity:** L.

**Acceptance:** a WhatsApp fixture yields messages with the subject mapped; a second distinct file accumulates chunks without removing the first file’s chunks; a duplicate hash does not double-charge embedding; an EICAR test file is rejected; deleting one file removes only that file’s chunks.

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

## Phase 5 — Images (Version 1 multimodal)

**Objective:** photos enter the knowledge base without speculative retrieval.

**Features:** image store, EXIF metadata, confirmed captions, image-to-memory linking. No speech, no TTS, no conversational voice.

**Depends on:** Phase 3. Can overlap Phase 4 only after text chat is stable.

**Complexity:** M.

**Acceptance:** image speculation is not retrievable while unconfirmed; audio and video uploads still return `415 UNSUPPORTED_MEDIA`.

**Done when:** an owner can attach a confirmed photo description to a memory and search it in text chat.

## Phase 6 — Production hardening

**Objective:** operate without reading private content.

**Features:** admin console, suspension, abuse report, restore drill, OpenTelemetry, load test, consent revocation UX, dispute freeze, backup alerts.

**Depends on:** MVP in real use.

**Complexity:** M.

**Acceptance:** restore drill recorded; admin content test still fails; spend alert fires on a synthetic overrun; p95 retrieval measured.

**Done when:** the single-server runbook is enough for someone other than the author to recover the database.

## Version 2 — Voice (next product version)

**Status:** held. Do not schedule engineering until Version 1 text conversation is in use and the product owner opens Version 2.

**Objective:** speak with the simulation without implying the person is present or that a cloned voice is authentic.

**Features (ordered):**

1. Browser recording → batch transcription → same text chat path → optional stock TTS of the reply (labeled synthetic).
2. WebSocket duplex audio, barge-in, shared session with the text transcript.
3. Consented custom synthetic voice for a living subject only, off by default. Legacy voice cloning stays off until counsel and a separate design approve it.
4. Audio and video source uploads that depend on transcription (voice notes, call recordings).

**Depends on:** Version 1 Phases 3 and 6 at minimum (stable text chat, consent, disclosure, spend controls).

**Acceptance:** every audio surface shows simulation disclosure; TTS and cloned audio are labeled synthetic; feature flags default off; a measured cost per voice minute is in the runbook before broad enablement.

**Done when:** text and voice share one conversation session without mixing conversational audio into biographical memory.

## Explicitly later (beyond Version 2)

Native mobile apps, public sharing links, fine-tuning, Kubernetes, a second vector database, multi-agent debate, automatic provider switching, and deceased-person voice cloning.
