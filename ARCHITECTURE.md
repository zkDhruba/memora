# Architecture

Memora is a TypeScript modular monolith. One NestJS codebase serves the HTTP API and the background worker. Next.js serves the product UI. PostgreSQL holds transactional data, full-text search, and vector search. Redis holds queues, rate limits, and short-lived cache. Object storage holds original files and generated audio.

Canonical diagrams: [docs/diagrams/01-system-context.md](docs/diagrams/01-system-context.md), [docs/diagrams/02-containers.md](docs/diagrams/02-containers.md).

## Runtime shape

```text
Browser
  -> Next.js (apps/web)
      -> NestJS API (apps/api) over HTTPS, cookie session
          -> PostgreSQL (records, permissions, chunks, pgvector)
          -> Redis (BullMQ, cache, rate limits)
          -> S3-compatible storage (originals, derivatives, audio)
          -> Allowlisted LLM / embedding providers (speech providers only in Version 2)
NestJS worker (same code, worker entry)
  -> same database, queue, storage, and allowlisted providers
```

The worker is a second process, not a second service with its own database or API. It imports the same modules and consumes BullMQ jobs.

## Boundaries that must not be crossed

1. Every persona-scoped query includes `persona_id` and an authorization check. PostgreSQL row-level security is a second barrier, not the only one.
2. Biographical memories and AI conversation memories use different memory domains and different retrieval filters. A chat with the simulation is never written back as an event in the real person's life.
3. Retrieved source text is untrusted data. It is wrapped and labeled so the model is instructed not to obey instructions found inside uploads.
4. A persona has an allowlisted model provider. The gateway does not fail over to a different company.
5. Administrators operate the platform. They do not receive a default ability to read persona content.

## Request path for chat

1. Authenticate the session.
2. Authorize the user for `conversation.participate` on that persona.
3. Load a compact persona card, relationship card, and safety rules.
4. Rewrite the query, then hybrid-search only chunks and memories the caller may see.
5. Assemble a token-budgeted prompt.
6. Stream the completion over server-sent events.
7. Persist the answer, citations, and usage. Store any new conversational memory in the conversational domain only.

Details: [docs/05-system-architecture.md](docs/05-system-architecture.md), [docs/06-ai-architecture.md](docs/06-ai-architecture.md), [docs/09-rag-pipeline.md](docs/09-rag-pipeline.md).

## Repository layout to create in Phase 1

```text
apps/web/          Next.js App Router
apps/api/          NestJS HTTP API and worker entrypoint
packages/db/       Drizzle schema and migrations
packages/shared/   Zod contracts shared by web and API
infra/             Docker Compose, Caddy, local MinIO config
docs/              This planning set
```

Python, LangGraph, a dedicated vector database, and Kubernetes are intentionally absent. Conditions that would add them are in [docs/20-technical-decisions.md](docs/20-technical-decisions.md).
