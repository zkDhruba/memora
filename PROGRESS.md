# Memora Version 1 — Progress tracker

Use this file to track what is done. When you finish a feature:

1. Change `[ ]` to `[x]`.
2. Set **Status** for that bite/phase if the whole bite is done.
3. Add a one-line note under **Log** at the bottom (date + what shipped).

Source of truth for task detail: [docs/19-implementation-task-breakdown.md](docs/19-implementation-task-breakdown.md).  
Roadmap: [docs/18-development-roadmap.md](docs/18-development-roadmap.md).  
Execution overview: ask the agent or see the chat execution plan (Phases 0–6).

**MVP ships when Phase 3 is complete.** Voice is Version 2 — do not track it here.

| Legend | Meaning |
| --- | --- |
| `[ ]` | Not started |
| `[x]` | Done |
| Status: `todo` / `in_progress` / `done` | Bite or phase rollup |

---

## Overall

| Phase | Name | Status | Notes |
| --- | --- | --- | --- |
| 0 | Planning / docs | done | Architecture docs complete |
| 1 | Platform foundation | in_progress | Auth, plans, persona CRUD, Chat picker |
| 2 | Ingestion | todo | Upload, parse, chunk, additive feeds |
| 3 | AI persona (MVP) | todo | Review, RAG, streaming chat, quotas |
| 4 | Personality / relationships | todo | After MVP |
| 5 | Images | todo | No voice |
| 6 | Production hardening | todo | Admin, backups, ops |

---

## Phase 1 — Platform foundation

**Phase status:** `in_progress`

### Bite 1 — Repo and infra

- [x] **1.1** Monorepo: pnpm, Turborepo, `apps/web`, `apps/api`, `packages/db`, `packages/shared`
- [ ] **1.2** Docker Compose: Postgres+pgvector, Redis, MinIO, Mailpit, ClamAV

### Bite 2 — Identity and plans

- [ ] **1.3** Drizzle migrations: users, sessions, mfa, audit, plans, subscriptions, personas, memberships, consents (seed Free/Pro/Pro+)
- [ ] **1.4** Register, verify email, login, reset, cookie session; Free subscription on signup
- [ ] **1.5** TOTP MFA + recovery codes (step-up on delete)

### Bite 3 — PlanGuard and persona CRUD

- [ ] **1.6** `PlanGuard` + `GET /me/plan` (personas 1/5/20, memory 100/1k/10k, daily sends 25/100/unlimited)
- [ ] **1.7** Persona CRUD UI/API, attestation, consent; listed on dashboard

### Bite 4 — Shell and Chat picker

- [ ] **1.8** Chat hub + persona switcher (persona appears after create, no publish step)
- [ ] **1.9** Membership checks; strangers get 404
- [ ] **1.10** Audit log for auth, consent, plan changes
- [ ] **1.11** App shell: Dashboard \| Chat \| Settings; disclosure on chat placeholder
- [ ] **1.12** CI: typecheck + unit tests green

**Phase 1 done when:** Free user creates one persona, sees it in Chat, cannot create a second; MFA delete works; CI green.

---

## Phase 2 — Ingestion

**Phase status:** `todo`

### Bite 1 — Upload

- [ ] **2.1** File/import tables, presign, complete → quarantine object
- [ ] **2.2** ClamAV scan; EICAR rejected

### Bite 2 — Jobs

- [ ] **2.3** BullMQ, generation, retries, dead letter

### Bite 3 — Parsers

- [ ] **2.4** Text + Markdown parser
- [ ] **2.5** DOCX + digital PDF (`needs_ocr` for scanned)
- [ ] **2.6** WhatsApp parser + subject mapping UI
- [ ] **2.7** Other participants default not retrievable

### Bite 4 — Chunk and library

- [ ] **2.8** Chunker (chat / journal / doc rules)
- [ ] **2.9** Import progress page
- [ ] **2.10** Reprocess one file only; purge one file only
- [ ] **2.11** Additive second-import test (A stays when B is added)

**Phase 2 done when:** uploads accumulate; duplicate hash safe; purge of A leaves B.

---

## Phase 3 — AI persona (MVP)

**Phase status:** `todo`

### Bite 1 — Providers

- [ ] **3.1** `LlmPort` + adapter; refuse without consent
- [ ] **3.2** Embedding adapter + HNSW

### Bite 2 — Extract and review

- [ ] **3.3** Style stats + trait drafts with quote check
- [ ] **3.4** Memory extractor; biographical ≠ conversational
- [ ] **3.5** Review inbox (confirm / reject / correct)

### Bite 3 — Retrieval

- [ ] **3.6** Hybrid retrieval + audience filter; sentinel isolation test
- [ ] **3.7** Prompt builder + token trimmer

### Bite 4 — Chat and quotas

- [ ] **3.8** SSE streaming chat + persistence
- [ ] **3.9** Citations + abstention rewrite
- [ ] **3.10** Conversational memory writer
- [ ] **3.10b** Plan chat-memory window (Free: msg 101 not in model context)
- [ ] **3.11** Daily send quota (Free 26th → `PLAN_LIMIT_CHAT_DAY`)
- [ ] **3.12** Playwright happy path with fake LLM
- [ ] **3.13** Staging deploy + spend alert

**Phase 3 / MVP done when:** feed → review → text chat with citations + disclosure; plan limits enforced.

---

## Phase 4 — After MVP

**Phase status:** `todo`

- [ ] **4.1** Relationships + claim approval
- [ ] **4.2** Audience-specific traits in compiled card
- [ ] **4.3** Conflict records + UI
- [ ] **4.4** Profile version history
- [ ] **4.5** Bangla + English gold cases
- [ ] **4.6** Eval runner
- [ ] **4.7** Email + Telegram parsers
- [ ] **4.8** Owner export
- [ ] **4.9** Calibration page

---

## Phase 5 — Images (no voice)

**Phase status:** `todo`

- [ ] **5.1** Image upload + EXIF
- [ ] **5.2** Vision description stored unconfirmed
- [ ] **5.3** Confirm/reject caption before retrieval
- [ ] **5.4** Link confirmed image to memory

---

## Phase 6 — Production hardening

**Phase status:** `todo`

- [ ] **6.1** Admin: users, job retry, usage, assign plan
- [ ] **6.2** Persona suspend + dispute
- [ ] **6.3** Backup + recorded restore
- [ ] **6.4** OpenTelemetry traces
- [ ] **6.5** k6 baseline
- [ ] **6.6** Revoke-consent UX
- [ ] **6.7** Runbook

---

## Version 2 — Voice (out of scope for this file)

Do not check these off as V1 work. See [docs/19-implementation-task-breakdown.md](docs/19-implementation-task-breakdown.md) Version 2 section when that version opens.

---

## Log

Newest first. Example:

```text
YYYY-MM-DD  Completed 1.1–1.2 — monorepo and Compose up
```

| Date | Completed | Note |
| --- | --- | --- |
| 2026-10-12 | 1.1 | pnpm+Turborepo monorepo; Next 16 web, Nest 12 API, shared+db packages; `pnpm check` green |

---

## How to use with Cursor

After finishing a feature, ask:

> Update PROGRESS.md: mark task X.Y done and add a log line for today.

Or edit this file yourself: `[ ]` → `[x]`, update the phase **Status**, append a log row.
