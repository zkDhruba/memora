# Memora Version 1 — Progress tracker

Use this file to track what is done. When you finish a feature:

1. Change `[ ]` to `[x]`.
2. Set **Status** for that bite/phase if the whole bite is done.
3. Add a one-line note under **Log** at the bottom (date + what shipped).
4. **Golden rule:** every completed task must include a **How to test** block (commands + expected result). The agent must give you those steps in chat; also keep a short copy under [How to test completed tasks](#how-to-test-completed-tasks) below.

Source of truth for task detail: [docs/19-implementation-task-breakdown.md](docs/19-implementation-task-breakdown.md).  
Roadmap: [docs/18-development-roadmap.md](docs/18-development-roadmap.md).  
Cursor rule: `.cursor/rules/task-completion-testing.mdc` (always apply).

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
| 1 | Platform foundation | done | Auth, plans, personas, audit, shell, CI |
| 2 | Ingestion | done | Upload, parse, chunk, additive feeds |
| 3 | AI persona (MVP) | in_progress | Review, RAG, streaming chat, quotas |
| 4 | Personality / relationships | todo | After MVP |
| 5 | Images | todo | No voice |
| 6 | Production hardening | todo | Admin, backups, ops |

---

## Phase 1 — Platform foundation

**Phase status:** `done`

### Bite 1 — Repo and infra

- [x] **1.1** Monorepo: pnpm, Turborepo, `apps/web`, `apps/api`, `packages/db`, `packages/shared`
- [x] **1.2** Docker Compose: Postgres+pgvector, Redis, MinIO, Mailpit, ClamAV

### Bite 2 — Identity and plans

- [x] **1.3** Drizzle migrations: users, sessions, mfa, audit, plans, subscriptions, personas, memberships, consents (seed Free/Pro/Pro+)
- [x] **1.4** Register, verify email, login, reset, cookie session; Free subscription on signup
- [x] **1.5** TOTP MFA + recovery codes (step-up on delete)

### Bite 3 — PlanGuard and persona CRUD

- [x] **1.6** `PlanGuard` + `GET /me/plan` (personas 1/5/20, memory 100/1k/10k, daily sends 25/100/unlimited)
- [x] **1.7** Persona CRUD UI/API, attestation, consent; listed on dashboard

### Bite 4 — Shell and Chat picker

- [x] **1.8** Chat hub + persona switcher (persona appears after create, no publish step)
- [x] **1.9** Membership checks; strangers get 404
- [x] **1.10** Audit log for auth, consent, plan changes
- [x] **1.11** App shell: Dashboard \| Chat \| Settings; disclosure on chat placeholder
- [x] **1.12** CI: typecheck + unit tests green

**Phase 1 done when:** Free user creates one persona, sees it in Chat, cannot create a second; MFA delete works; CI green.

---

## Phase 2 — Ingestion

**Phase status:** `done`

### Bite 1 — Upload

- [x] **2.1** File/import tables, presign, complete → quarantine object
- [x] **2.2** ClamAV scan; EICAR rejected

### Bite 2 — Jobs

- [x] **2.3** BullMQ, generation, retries, dead letter

### Bite 3 — Parsers

- [x] **2.4** Text + Markdown parser
- [x] **2.5** DOCX + digital PDF (`needs_ocr` for scanned)
- [x] **2.6** WhatsApp parser + subject mapping UI
- [x] **2.7** Other participants default not retrievable

### Bite 4 — Chunk and library

- [x] **2.8** Chunker (chat / journal / doc rules)
- [x] **2.9** Import progress page
- [x] **2.10** Reprocess one file only; purge one file only
- [x] **2.11** Additive second-import test (A stays when B is added)

**Phase 2 done when:** uploads accumulate; duplicate hash safe; purge of A leaves B.

---

## Phase 3 — AI persona (MVP)

**Phase status:** `in_progress`

### Bite 1 — Providers

- [x] **3.1** `LlmPort` + adapter; refuse without consent
- [x] **3.2** Embedding adapter + HNSW

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
| 2026-10-14 | 3.2 | chunk_embeddings + HNSW; EmbeddingPort via OpenRouter; cosine nearest + check-embeddings |
| 2026-10-14 | 3.1 | LlmPort + OpenRouter adapter (testing); ProviderConsentService; refuse without send_to_provider |
| 2026-10-14 | 2.11 | Additive second import: A chunks intact after B; sum counts; FILE_DUPLICATE; Phase 2 done |
| 2026-10-14 | 2.10 | DELETE file/import purge (chunks/messages/docs/objects); POST reprocess; UI Delete; check-purge |
| 2026-10-14 | 1.7+ | POST /personas/:id/restore + dashboard Restore; soft-delete still counts until purge (Free slot trap fixed) |
| 2026-10-14 | 2.9+ | Unblock stuck PNG uploads → needs_attention; reject images in parse + UI; terminal progress when unsupported |
| 2026-10-14 | 2.9 | GET import progress (files/jobs/%); polling UI; New import + upload on progress page |
| 2026-10-13 | 2.8 | document_chunks + chat/journal/prose chunkers; chunk after parse / subject map |
| 2026-10-13 | 2.7 | source_participants.retrieval_allowed; others/unknown false; subject true on map |
| 2026-10-13 | 2.6 | WhatsApp bracketed+dashed parsers; participants/messages; subject-mapping API+UI |
| 2026-10-13 | 2.5 | mammoth DOCX→md + unpdf digital PDF; scanned PDF → needs_ocr; fixtures + check-docx-pdf |
| 2026-10-13 | 2.4 | documents table; UTF-8 text/md parser; parse job writes documents; fixtures + check-parse |
| 2026-10-13 | 2.3 | BullMQ ingestion queue + DLQ; processing_jobs; worker entry; retry then success + dead after 5 |
| 2026-10-13 | 2.2 | ClamAV INSTREAM on complete; clean→memora-clean; EICAR→FILE_INFECTED + quarantine delete |
| 2026-10-13 | 2.1 | source_imports/files/versions; S3 presign PUT → quarantine; complete + HeadObject; CONSENT_REQUIRED |
| 2026-10-13 | 1.12 | GitHub Actions CI: typecheck + tests with Postgres/Redis; `pnpm ci:check`; shared plan unit tests |
| 2026-10-13 | 1.11 | App shell polish: Log out, skip link, EmptyState, chat listbox ↑/↓, disclosure; Settings logout-all |
| 2026-10-13 | 1.10 | Audit inserts (auth/consent/plan.change/authz.denied); GET /me/audit; Settings activity list; change-plan script |
| 2026-10-13 | 1.9 | PersonaAccessService: strangers → 404 PERSONA_NOT_FOUND; wrong role → 403; vitest + HTTP check |
| 2026-10-13 | 1.8 | Chat hub + persona switcher; disclosure banner; create lands on /chat?persona=; no publish step |
| 2026-10-13 | 1.7 | Persona CRUD API+UI; attestation; consents; draft→collecting; Free second create PLAN_LIMIT_PERSONAS |
| 2026-10-13 | 1.6 | PlanGuard + GET /me/plan; assertCanCreatePersona → PLAN_LIMIT_PERSONAS; daily send Redis helpers |
| 2026-10-12 | 1.5 | TOTP MFA + recovery codes; step-up for logout-all; DELETE /me requires password+MFA; APP_DATA_KEY encrypt |
| 2026-10-12 | 1.4 | Argon2id auth: register/verify/login/logout/reset; HttpOnly cookie sessions; Free sub on signup; Mailpit OK |
| 2026-10-12 | 1.3 | Drizzle schema + migration for identity/plans/personas/consents; seed Free/Pro/Pro+; migrate twice OK |
| 2026-10-12 | 1.2 | Compose stack up: Postgres 18+pgvector, Redis 7, Silo (MinIO API), Mailpit, ClamAV; buckets + healthchecks verified |
| 2026-10-12 | 1.1 | pnpm+Turborepo monorepo; Next 16 web, Nest 12 API, shared+db packages; `pnpm check` green |

---

## How to test completed tasks

### 1.1 — Monorepo scaffold

```bash
# From repo root
corepack enable
pnpm install
pnpm check
```

**Expect:** Turbo builds `@memora/shared`, `@memora/db`, `@memora/api`, `@memora/web` and typecheck all pass with exit code 0.

```bash
# Optional — run apps (separate terminals)
pnpm --filter @memora/api dev
# → http://localhost:4000/api/v1/health/live  →  {"status":"ok", ...}

pnpm --filter @memora/web dev
# → http://localhost:3000  →  landing page mentioning Memora and plan ids
```

**Fail if:** `pnpm check` errors; health URL is not JSON `status: ok`; home page does not load.

### 1.2 — Docker Compose dependencies

```bash
# From repo root (Docker required)
pnpm deps:up
pnpm deps:ps
```

**Expect:** `postgres`, `redis`, `minio`, `mailpit`, `clamav` show `healthy` (ClamAV may take a few minutes on first boot).

```bash
# Postgres + pgvector
docker exec memora-postgres psql -U memora -d memora -c "SELECT extname FROM pg_extension WHERE extname='vector';"
# → vector

# Redis
docker exec memora-redis redis-cli ping
# → PONG

# Object store (S3 / Silo)
curl -sf http://127.0.0.1:9000/minio/health/live && echo OK
# → OK

# Mailpit UI API
curl -sf http://127.0.0.1:8025/api/v1/info
# → JSON with Version

# Buckets (quarantine + clean)
docker run --rm --network memora_default --entrypoint /bin/sh pgsty/mc:latest \
  -c 'mc alias set local http://minio:9000 memora memoradevpass && mc ls local/'
# → memora-clean/ and memora-quarantine/
```

**Fail if:** any service stays unhealthy; `vector` extension missing; health/live or Mailpit API fail; buckets missing.

**Note:** Local object store image is `pgsty/silo` (MinIO S3 API). Official `minio/minio` was removed from Docker Hub in 2026; `.env` S3 settings are unchanged.

### 1.3 — Drizzle migrations + plan seed

```bash
pnpm deps:up          # Postgres healthy
pnpm db:migrate       # apply (safe a second time)
pnpm db:migrate       # expect "Migrations applied" again, no errors
pnpm db:seed          # upsert Free / Pro / Pro+

docker exec memora-postgres psql -U memora -d memora -c "\dt"
docker exec memora-postgres psql -U memora -d memora \
  -c "SELECT id, display_name, limits->>'maxOwnedPersonas' AS max_owned FROM plans ORDER BY sort_order;"
```

**Expect:** ten tables (`users` … `consents`); three plans with max owned **1 / 5 / 20**. Second migrate is a no-op. Second seed updates in place.

**Fail if:** migrate errors on second run; plan rows missing or wrong limits; `pnpm --filter @memora/db typecheck` fails.

### 1.4 — Auth (register → Mailpit → verify → login → /me)

```bash
pnpm deps:up
pnpm db:migrate && pnpm db:seed
pnpm --filter @memora/api dev   # http://localhost:4000
```

```bash
API=http://localhost:4000/api/v1
EMAIL="you@example.com"
PASS='test-password-123'
JAR=/tmp/memora.jar

# Register → Mailpit gets verification mail
curl -sS -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"displayName\":\"You\"}"
# → {"userId":"..."}
# Open http://localhost:8025 — subject "Verify your Memora email"

# Copy token from Mailpit body, then:
curl -sS -X POST "$API/auth/verify-email" -H 'Content-Type: application/json' \
  -d '{"token":"<TOKEN>"}'
# → {"verified":true}

curl -sS -c "$JAR" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
curl -sS -b "$JAR" "$API/me"
# → emailVerified true, plan.planId "free"

# Subscription row
docker exec memora-postgres psql -U memora -d memora \
  -c "SELECT plan_id, status FROM subscriptions ORDER BY created_at DESC LIMIT 1;"
# → free | active
```

**Edge — bad password:** `POST /auth/login` with wrong password → `401 INVALID_CREDENTIALS` (same message for unknown email).

**Edge — reset:** `POST /auth/password/forgot` → always `202`; Mailpit has reset mail; `POST /auth/password/reset` → `204` and old session cookie fails `/me` with `401`.

**Fail if:** no Mailpit message after register; `/me` missing `plan.planId=free`; cookie not HttpOnly.

### 1.5 — TOTP MFA + step-up delete

```bash
pnpm deps:up && pnpm --filter @memora/api dev
# After register/verify/login (cookie jar $JAR):

curl -sS -b "$JAR" -X POST http://localhost:4000/api/v1/auth/mfa/setup
# → { otpauthUrl, secret }  — add secret to an authenticator (or otplib generateSync)

curl -sS -b "$JAR" -X POST http://localhost:4000/api/v1/auth/mfa/confirm \
  -H 'Content-Type: application/json' -d '{"code":"<6-digit>"}'
# → { recoveryCodes: [10 codes] }  — save once

curl -sS -b "$JAR" http://localhost:4000/api/v1/me
# → mfaEnabled: true

# Login now requires totp or recoveryCode
curl -sS -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}'
# → 401 MFA_REQUIRED

# logout-all needs step-up first
curl -sS -b "$JAR" -X POST http://localhost:4000/api/v1/auth/logout-all
# → 403 MFA_STEP_UP_REQUIRED

curl -sS -b "$JAR" -X POST http://localhost:4000/api/v1/auth/mfa/step-up \
  -H 'Content-Type: application/json' -d '{"totp":"<code>"}'
# → 204

# Delete account (step-up on delete)
curl -sS -b "$JAR" -X DELETE http://localhost:4000/api/v1/me \
  -H 'Content-Type: application/json' \
  -d '{"password":"...","totp":"<code>"}'
# → 204; further login → 401
```

**Fail if:** setup returns 500 (check `APP_DATA_KEY`); confirm without setup succeeds; delete without MFA when enabled succeeds; logout-all without step-up succeeds when MFA on.

### 1.6 — PlanGuard + GET /me/plan

```bash
pnpm deps:up && pnpm db:seed && pnpm --filter @memora/api dev
# After register/verify/login ($JAR, $USER_ID):

curl -sS -b "$JAR" http://localhost:4000/api/v1/me/plan
# → planId free, maxOwnedPersonas 1, maxChatMemoryMessages 100,
#   maxChatMessagesPerDay 25, ownedPersonaCount 0, canCreatePersona true

# Simulate first owned persona (until 1.7 POST /personas exists):
# INSERT persona + persona_memberships role=owner for $USER_ID

curl -sS -b "$JAR" http://localhost:4000/api/v1/me/plan
# → ownedPersonaCount 1, canCreatePersona false

pnpm --filter @memora/api exec tsx scripts/check-plan-limit.ts "$USER_ID"
# → 403 PLAN_LIMIT_PERSONAS { plan, maxOwnedPersonas, currentOwned }
```

**Edge — daily send:** set Redis `chat_send:{userId}:{yyyyMMdd}` to 25 → `chatMessagesUsedToday: 25`; `assertCanSendChatMessage` → `429 PLAN_LIMIT_CHAT_DAY`.

**Fail if:** Free plan shows wrong caps; second owned persona still allows create; Pro+ daily cap is not `null`.

### 1.7 — Persona CRUD (API + dashboard)

```bash
pnpm deps:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @memora/api dev    # :4000
pnpm --filter @memora/web dev    # :3000
```

**Browser happy path**
1. Register / verify (Mailpit :8025) / login → `/dashboard`
2. Create persona (`/personas/new`) with self attestation + host + converse consents
3. Persona listed on dashboard with status `collecting`
4. Open persona → edit biography → Save

**API — Free second create**
```bash
# After one owned persona on Free:
curl -sS -b "$JAR" -X POST http://localhost:4000/api/v1/personas \
  -H 'Content-Type: application/json' -d '{...}'
# → 403 PLAN_LIMIT_PERSONAS
```

**Draft until consent:** create without `consents` → `status: draft`, `chatEligible: false`; grant `host_records` + `converse` → `collecting`.

**Fail if:** second Free create succeeds; persona missing from dashboard; stranger `GET /personas/:id` is not 404.

### 1.8 — Chat hub + persona switcher

```bash
pnpm --filter @memora/api dev
pnpm --filter @memora/web dev
```

1. Create a persona (wizard) → you should land on `/chat?persona=<id>`
2. Left rail lists the new persona (no publish step)
3. Disclosure banner is visible (“AI simulation… not the real person”)
4. Open `/chat` from nav — same list via `GET /personas?for=chat`
5. Soft-deleted / suspended personas must not appear in the switcher

**Empty:** user with zero personas sees CTA to create (or plan-cap copy).

**Fail if:** new persona missing from Chat until some publish action; disclosure missing; composer claims live streaming (it stays disabled until Phase 3).

### 1.9 — Membership checks (strangers → 404)

```bash
pnpm deps:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @memora/api test
# → 7 passed (PersonaAccessService + PersonasService)

pnpm --filter @memora/api build && pnpm --filter @memora/api start   # :4000
pnpm --filter @memora/api exec tsx scripts/check-persona-access.ts
# → ok stranger GET → 404 PERSONA_NOT_FOUND
# → ok stranger DELETE → 404 PERSONA_NOT_FOUND
# → ok participant consents → 403 PERSONA_FORBIDDEN
# → ok participant GET → 200
```

**Happy path:** Owner (or any member) `GET /personas/:id` → 200. Participant can read; owner/manager can update.

**Edge — stranger:** Any persona-scoped route for a non-member returns `404` with `error.code=PERSONA_NOT_FOUND` (does not leak that the id exists). Soft-deleted personas also 404.

**Edge — wrong role:** Participant `DELETE /personas/:id` or `GET .../consents` → `403 PERSONA_FORBIDDEN`.

**Fail if:** stranger gets 403 (existence leak) or 200; participant can soft-delete or list consents.

### 1.10 — Audit log (auth, consent, plan changes)

```bash
pnpm deps:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @memora/api test
# → includes audit.integration.test.ts (plan.change + listForActor)

pnpm --filter @memora/api build && pnpm --filter @memora/api start   # :4000
pnpm --filter @memora/web dev                                       # :3000
```

**Happy path (API)** — after register/verify/login (`$JAR`, `$USER_ID`):

```bash
curl -sS -b "$JAR" 'http://localhost:4000/api/v1/me/audit?limit=20'
# → data[] includes auth.register, plan.change (signup → free), auth.login

pnpm --filter @memora/api exec tsx scripts/change-plan.ts "$USER_ID" pro "manual-upgrade"
curl -sS -b "$JAR" 'http://localhost:4000/api/v1/me/audit?limit=5'
# → newest plan.change metadata.from=free metadata.to=pro

# Consent: create persona with consents (or grant) → consent.grant rows appear
```

**Frontend:** Settings → **Recent activity** lists the same events (`GET /me/audit`).

**Edge:** Participant denied an owner action → `authz.denied` row for that actor (NFR-3). Stranger 404 is not audited (no existence leak).

**Fail if:** `/me/audit` empty after login; plan change script does not insert `plan.change`; Settings activity missing after auth actions.

### 1.11 — App shell (nav, empty states, disclosure, logout)

```bash
pnpm deps:up && pnpm --filter @memora/api start   # :4000
pnpm --filter @memora/web dev                     # :3000
```

**Browser happy path**
1. Sign in → top nav shows **Dashboard | Chat | Settings** + **Log out**
2. Tab from the top of the page → **Skip to main content** appears; Enter jumps to `#main-content`
3. Dashboard with zero personas → dashed empty state + create CTA (or plan-cap copy)
4. Chat with personas → non-dismissible **AI simulation disclosure**; focus persona list and use ↑/↓
5. Settings → **Log out** or **Log out all devices** → redirected to `/login`; `/dashboard` then requires login again

**Edge:** MFA enabled → Log out all without step-up shows MFA step-up message (does not clear session).

**Fail if:** no logout control; disclosure missing on Chat; Tab order skips primary nav; empty dashboard/chat has no guidance.

### 1.12 — CI (typecheck + tests)

```bash
# Local (deps up for API integration tests)
pnpm deps:up && pnpm db:migrate && pnpm db:seed
pnpm ci:check
# → turbo typecheck all packages; vitest: shared (3) + api (9)
```

**GitHub:** push a branch / open a PR → workflow **CI** (`.github/workflows/ci.yml`) runs on Ubuntu with `pgvector/pgvector:pg18` + Redis service containers, migrates/seeds, then `pnpm ci:check`.

**Happy path:** Actions check is green; locally `pnpm ci:check` exits 0.

**Edge:** without `DATABASE_URL` / Postgres, `@memora/api` integration tests fail (expected). Shared unit tests still run.

**Fail if:** workflow missing; lockfile drift breaks `--frozen-lockfile`; typecheck or tests red on PR.

### 2.1 — Presign upload → quarantine

```bash
pnpm deps:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @memora/api build && pnpm --filter @memora/api start   # :4000

pnpm --filter @memora/api exec tsx scripts/check-upload.ts
# → PUT ok 200; complete status uploaded; quarantine head ContentLength > 0
# → complete without PUT → FILE_NOT_UPLOADED
```

**API happy path** (after login + persona with `host_records` consent):

```bash
# POST /personas/:id/imports → { id }
# POST /personas/:id/files/presign { importId, filename, mediaType, byteSize }
#   → { fileId, url, headers }  (presigned PUT to memora-quarantine)
# PUT $url with those headers and body
# POST /personas/:id/files/:fileId/complete { sha256? } → status uploaded
```

**Edge:** no `host_records` → `422 CONSENT_REQUIRED`. Unsupported MIME → `400` validation. Complete before PUT → `400 FILE_NOT_UPLOADED`.

**Fail if:** object missing from quarantine after complete; API proxies file bytes; participant can presign.

### 2.2 — ClamAV scan (EICAR rejected)

```bash
pnpm deps:up   # clamav healthy on :3310
pnpm --filter @memora/api build && pnpm --filter @memora/api start

# Clean file → status clean, object in memora-clean
pnpm --filter @memora/api exec tsx scripts/check-upload.ts

# EICAR → 422 FILE_INFECTED, quarantine object deleted
pnpm --filter @memora/api exec tsx scripts/check-eicar.ts
```

**Happy path:** `complete` after PUT scans via clamd INSTREAM → `status: clean`, bucket `memora-clean`.

**Edge — EICAR:** upload the standard EICAR string → `422` `FILE_INFECTED` (signature in details); file row `infected`; quarantine key gone.

**Edge — scanner down:** `503 SCANNER_UNAVAILABLE` (set `CLAMAV_SKIP=true` only for local tests without clamd).

**Fail if:** EICAR completes as clean; clean file stays only in quarantine without promotion.

### 2.3 — BullMQ jobs (retries + dead letter)

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build
pnpm --filter @memora/api start          # API enqueues parse after clean upload
pnpm --filter @memora/api worker         # separate process (or `dev:worker`)

# Retry + DLQ verification (script boots its own worker)
pnpm --filter @memora/api exec tsx scripts/check-job-retry.ts
# → ok retry-then-success attempts=3
# → ok dead-letter after 5 attempts; dlq depth increases
```

**Happy path:** clean `complete` inserts `processing_jobs` (stage `parse`, generation 1) and enqueues BullMQ `ingestion`. Worker runs the text/md parser (2.4).

**Edge — retries:** forced failures until attempt 3 still complete. Always-failing `test_fail` → status `dead` after 5 attempts and a row on `ingestion-dlq`.

**Fail if:** no worker picks up jobs; failed jobs never reach DLQ; `(file_version_id, stage, generation)` uniqueness broken.

### 2.4 — Text + Markdown parser

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build
pnpm --filter @memora/api start          # :4000 (upload + enqueue)
# Optional dedicated worker: pnpm --filter @memora/api worker

# Unit fixtures (BOM/CRLF + markdown)
pnpm --filter @memora/api test
# → text-markdown.parser.test.ts (and other API tests) green

# E2E (script boots its own worker)
pnpm --filter @memora/api exec tsx scripts/check-parse.ts
# → ok plain → documents …
# → ok markdown → documents …
# → ok empty text → needs_attention
# → parse check passed
```

**Happy path:** clean upload of `apps/api/fixtures/plain.txt` / `notes.md` → parse job → `source_files.status = parsed` and a `documents` row (`plain_text` / `markdown`) with preview + char count. Bodies ≤100 KB stored inline.

**Edge — empty / binary:** whitespace-only or binary → `needs_attention` and `parseReport.errorCode` (`EMPTY` / `BINARY` / `ENCODING`); no document row.

**Fail if:** parse job still stubs `queued_stub`; `.txt`/`.md` never create `documents`; empty file stays `clean` forever.

### 2.5 — DOCX + digital PDF

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build
pnpm --filter @memora/api start          # :4000

# Unit fixtures
pnpm --filter @memora/api test
# → docx-pdf.parser.test.ts green (DOCX markdown, digital PDF prose, scanned NEEDS_OCR)

# E2E (script boots its own worker)
pnpm --filter @memora/api exec tsx scripts/check-docx-pdf.ts
# → ok docx → documents …
# → ok digital pdf → documents …
# → ok scanned pdf → needs_ocr / needs_attention
# → docx-pdf check passed
```

**Happy path:** `fixtures/sample.docx` → `documents.kind = markdown`; `fixtures/digital.pdf` → `kind = prose`; file status `parsed`. Embedded DOCX images are ignored (count in `parseReport`).

**Edge — scanned PDF:** `fixtures/scanned.pdf` (sparse text on most pages) → `status = needs_attention`, `parseReport.parse = needs_ocr`, no `documents` row. OCR is not run.

**Fail if:** digital PDF stays `clean` forever; scanned PDF creates a document; DOCX never produces markdown text.

### 2.6 — WhatsApp parser + subject mapping

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build && pnpm --filter @memora/api start
pnpm --filter @memora/web dev   # optional UI check

# Unit (both date styles)
pnpm --filter @memora/api test
# → whatsapp.parser.test.ts green

# E2E
pnpm --filter @memora/api exec tsx scripts/check-whatsapp.ts
# → ok bracketed parse …
# → ok dashed parse …
# → ok subject mapping Alice → subject, Bob → other
# → whatsapp check passed
```

**Happy path:** upload `whatsapp-bracketed.txt` / `whatsapp-dashed.txt` → thread + participants + messages; `POST …/subject-mapping` sets subject/`parsed`. Persona page lists files needing mapping (owner/manager).

**Edge:** media-omitted / encryption lines → `system` messages (not speech). Continuations append to prior body. Contributor cannot map (manager+).

**Fail if:** only one date style parses; mapping leaves others as `unknown`; UI never shows Map subject.

### 2.7 — Other participants not retrievable

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api test
# → defaultRetrievalAllowed unit + participant-retrieval.integration flag test

pnpm --filter @memora/api build && pnpm --filter @memora/api start
pnpm --filter @memora/api exec tsx scripts/check-whatsapp.ts
# → ok subject mapping Alice → subject+retrievable, Bob → other+blocked
```

**Happy path:** new participants insert with `retrieval_allowed = false`. After subject mapping, subject is `true`; every `other` stays `false` (GOV-2). API `GET …/participants` returns the flag; UI shows “not retrievable”.

**Edge:** remapping a different name flips flags — previous subject becomes other+false; new subject true.

**Fail if:** `other` rows ever default to `retrieval_allowed = true`; chunker embeds them without checking the flag.

### 2.8 — Chunker (chat / journal / doc)

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api test
# → chunker.test.ts (chat windows, journal dates, prose/owner-note)

pnpm --filter @memora/api build && pnpm --filter @memora/api start

# Document → chunks
pnpm --filter @memora/api exec tsx scripts/check-chunk.ts
# → ok document chunks N …

# Chat → chunks after subject mapping
pnpm --filter @memora/api exec tsx scripts/check-whatsapp.ts
# → ok chunks … subject … other …
```

**Happy path:** parsed documents write `document_chunks` (prose/journal rules). WhatsApp subject mapping writes chat windows (6 subject msgs, overlap 2) plus non-retrievable other-speaker chunks. `content_tsv` filled with `simple` FTS.

**Edge:** other-speaker chunks have `retrieval_allowed = false`. Oversized single chat message is not split. Dated journal entries are not merged.

**Fail if:** parse succeeds with zero chunks for non-empty text; other-speaker chunks are retrievable; chat chunking runs before subject mapping.

### 2.9 — Import progress page

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build && pnpm --filter @memora/api start
pnpm --filter @memora/api worker   # or rely on check script’s worker
pnpm --filter @memora/web dev      # :3000

# Unit helpers
pnpm --filter @memora/api test
# → import-progress.test.ts green

# API poll until terminal
pnpm --filter @memora/api exec tsx scripts/check-import-progress.ts
# → progress … → ok terminal parsed … → import progress check passed
```

**Browser happy path**
1. Persona → **New import** → `/personas/:id/imports/:importId`
2. Upload a `.txt` / `.md` → progress bar moves; status reaches `parsed` / `needs_attention`
3. Polling stops when overall `terminal: true` (copy says “Polling stopped”)

**Edge:** empty import stays non-terminal (keeps polling). WhatsApp file needing subject mapping is terminal at `needs_attention` until mapped (then re-open Progress to refresh).

**Fail if:** UI polls forever after all files are `parsed`; GET import returns no `files` / `percent`; New import button missing.

### 2.10 — Reprocess + purge one file

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build && pnpm --filter @memora/api start
pnpm --filter @memora/api worker   # needed for reprocess parse
pnpm --filter @memora/web dev

# Automated: purge A leaves B
pnpm --filter @memora/api exec tsx scripts/check-purge.ts
# → ok both files parsed → ok purged A → ok purge of A left B intact

pnpm --filter @memora/api test
# → import-progress.test.ts (deleting = 90%, not terminal)
```

**Browser**
1. Persona → source file **Delete** (or import progress → **Delete** / **Delete import**)
2. Confirm → file disappears; training chunks/messages for that file are gone
3. Other files on the same persona still listed with their content

**Edge:** purge of file A does not remove file B’s chunks. Reprocess clears only that file’s derivatives then re-parses (worker must be running).

**Fail if:** deleting A removes B’s chunks; Delete leaves `needs_attention`/`parsed` rows still retrievable for A.

### 2.11 — Additive second-import test

```bash
pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build && pnpm --filter @memora/api start
# Worker optional — script starts its own:
pnpm --filter @memora/api exec tsx scripts/check-additive-import.ts
# → ok import 1 file A parsed
# → ok import 2 file B parsed
# → ok additive: A intact (n) + B (m) = n+m
# → ok duplicate SHA-256 rejected (FILE_DUPLICATE)
# → ok additive second-import check passed
```

**Browser**
1. Persona → New import → upload journal A → wait until parsed
2. New import again → upload different journal B → A still listed; both have content
3. Re-upload the exact same bytes as A → expect duplicate / conflict error

**Edge:** confirmed biographical *memories* are Phase 3; this check uses chunks as the Phase 2 stand-in for “A’s knowledge stays.”

**Fail if:** second import wipes A’s chunks; total ≠ A+B; duplicate upload succeeds as a second corpus.

### 3.1 — LlmPort + OpenRouter (consent gate)

```bash
# Put key only in gitignored .env (never commit):
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=openai/gpt-4o-mini

pnpm deps:up && pnpm db:migrate
pnpm --filter @memora/api build && pnpm --filter @memora/api start

pnpm --filter @memora/api test
# → provider-consent.service.test.ts green

pnpm --filter @memora/api exec tsx scripts/check-llm.ts
# → ok refuse without send_to_provider → CONSENT_REQUIRED
# → ok granted send_to_provider for openrouter
# → ok llm complete with consent — check-llm passed
```

**Edge:** call with `provider: "openrouter"` but consent only for `anthropic` → `CONSENT_REQUIRED`. Missing `OPENROUTER_API_KEY` → `LLM_NOT_CONFIGURED`.

**Fail if:** complete succeeds without `send_to_provider`; API key appears in git history / committed files.

### 3.2 — Embedding adapter + HNSW

```bash
# .env: OPENROUTER_API_KEY + EMBEDDING_MODEL=openai/text-embedding-3-small
pnpm db:migrate
# → chunk_embeddings + HNSW (m=16, ef_construction=64)

pnpm --filter @memora/api test
# → fake-embedding.adapter.test.ts green

pnpm --filter @memora/api build && pnpm --filter @memora/api start
pnpm --filter @memora/api exec tsx scripts/check-embeddings.ts
# → ok embedded N chunks
# → ok cosine order — tea closer than bike — check-embeddings passed
```

**Edge:** no `send_to_provider` → embed refused (`CONSENT_REQUIRED`). Other-speaker chunks with `retrieval_allowed=false` are not embedded.

**Fail if:** vectors missing after embed; nearest order ignores cosine (tea query returns bike first).

---

## How to use with Cursor

After finishing a feature, ask:

> Update PROGRESS.md: mark task X.Y done and add a log line for today.

Or edit this file yourself: `[ ]` → `[x]`, update the phase **Status**, append a log row.

The agent must always reply with **How to test** for that task (golden rule).
