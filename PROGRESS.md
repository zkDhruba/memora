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

---

## How to use with Cursor

After finishing a feature, ask:

> Update PROGRESS.md: mark task X.Y done and add a log line for today.

Or edit this file yourself: `[ ]` → `[x]`, update the phase **Status**, append a log row.

The agent must always reply with **How to test** for that task (golden rule).
