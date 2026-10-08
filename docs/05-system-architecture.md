# 05 — System architecture

Related: [ARCHITECTURE.md](../ARCHITECTURE.md), [06-ai-architecture.md](06-ai-architecture.md), [12-api-design.md](12-api-design.md), [diagrams/02-containers.md](diagrams/02-containers.md).

## Style

Modular monolith. One deployable API image. The worker is the same image with `node dist/worker.js`. Modules talk through injected services and BullMQ, not over the network.

```text
apps/api/src/modules/
  auth, users, audit, personas, consent, authorization,
  files, ingestion, processing, personality, memory,
  retrieval, conversation, relationships, voice, media,
  evaluation, admin, billing-usage, health
```

Dependency direction: HTTP controllers depend on application services. Services depend on repositories and ports (`LlmPort`, `EmbeddingPort`, `ObjectStorePort`, `ScannerPort`). Adapters sit at the edge. Domain modules do not import provider SDKs.

## Containers

| Container | Responsibility |
| --- | --- |
| `web` | Next.js. Renders pages, holds the session cookie path, streams chat from the API |
| `api` | REST, SSE, auth, authorization, presigned uploads |
| `worker` | Parsing, extraction, embeddings, deletion propagation, email |
| `postgres` | Data, FTS, pgvector |
| `redis` | BullMQ and rate limits |
| `minio` | Local S3. Replaced by managed object storage in production |
| `clamav` | `clamd` scan of new objects |
| `caddy` | TLS and routing in production |
| `mailpit` | Local email catcher. Production uses a transactional email provider |

No public port on Postgres, Redis, or the worker.

## Trust zones

1. **Browser.** Untrusted. CSRF protection on cookie mutations: SameSite=Lax plus a double-submit token for state-changing requests from the web origin.
2. **Web server.** Does not hold service credentials for model providers.
3. **API.** Enforces authz. Writes audit events.
4. **Worker.** Same authz library when it materializes derived data. It may read files the uploader was allowed to submit. It must stamp `persona_id` on every derived row.
5. **Providers.** Receive only the minimum text for the current job, and only if consent names that provider. No cross-persona batching in one request.

## Multi-tenancy

The tenant boundary is the **persona**, not the user. A user can belong to several personas. Every content table has `persona_id` and a foreign key to `personas`.

Application repositories require a `PersonaScope` argument (`personaId` plus `actorUserId`) and throw if a query is built without it. A lint rule or a single `scopedDb` helper should make unscoped queries awkward.

PostgreSQL row-level security is enabled on content tables in production. The API sets `SET LOCAL app.persona_ids` to the set the request may touch, inside a transaction. Background jobs set the single persona id for the job. Superuser migrations bypass RLS; the application role does not.

This is defense in depth. A missing `WHERE` should return zero rows, not another persona.

## Consistency rules

- Uploads: object write, then database row `status=stored`, then enqueue. If enqueue fails, a sweeper enqueues stored-but-unqueued files.
- Jobs are idempotent on `(file_version_id, stage, generation)`.
- Chat messages: insert the user message, stream the assistant message into a row that flips from `streaming` to `complete` or `failed`.
- Deletion: mark the source `deleting`, enqueue purge, delete derived rows and objects, then hard-delete or tombstone as specified in [11-database-design.md](11-database-design.md).

## Synchronous versus queued

| Synchronous | Queued |
| --- | --- |
| Auth, persona CRUD, presign, job status, chat token streaming, review decisions | Parse, extract, embed, purge, email, title generation, export |

Chat retrieval and the model call stay on the request path. They are not queued. A separate extraction agent is not started per message.

## Failure behavior

- Provider timeout: one retry with jitter for idempotent embedding and extraction calls. Chat retries only if no token has been sent; otherwise the message is `failed` and the user can retry.
- Poison messages: BullMQ dead-letter after 5 attempts. Alert on dead-letter depth.
- Partial parse: store the successful messages, record the byte offset or line of the failure, and let a reviewer reprocess.
- Database unavailable: API returns 503. The web shell shows a status page. Jobs remain in Redis until Postgres returns.

## Horizontal scale

The API is stateless aside from the database and Redis. SSE connections stick to one API node for the life of the response; no cross-node fanout is required for chat. Scale workers by replica count. Do not scale the web tier independently of need; it is light compared with model latency.

## Module dependency sketch

```text
auth -> users
personas -> auth, consent
files -> personas, consent, object store
processing -> files, personality, memory, retrieval
conversation -> personas, retrieval, memory, llm port
admin -> audit, jobs (metadata only)
```

`conversation` must not depend on `files` directly. It reads chunks and memories through retrieval, which applies audience filters.
