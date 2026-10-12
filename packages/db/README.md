# `@memora/db`

Drizzle ORM schema and SQL migrations for Memora.

## Commands (from repo root)

```bash
pnpm deps:up       # Postgres must be running
pnpm db:generate   # drizzle-kit generate (after schema edits)
pnpm db:migrate    # apply pending migrations (safe to run twice)
pnpm db:seed       # upsert Free / Pro / Pro+ plan catalog
```

`DATABASE_URL` comes from repo-root `.env` (or `.env.example` defaults).

## Phase 1.3 tables

`users`, `sessions`, `mfa_factors`, `recovery_codes`, `audit_logs`, `plans`, `subscriptions`, `personas`, `persona_memberships`, `consents`.

Persona-scoped tables have RLS enabled (`app.persona_ids` session setting). The local Compose role is a superuser and bypasses RLS until a non-bypass app role is introduced.
