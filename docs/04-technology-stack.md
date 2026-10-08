# 04 — Technology stack

Related: [20-technical-decisions.md](20-technical-decisions.md), [15-infrastructure-deployment.md](15-infrastructure-deployment.md), [16-cost-and-scaling.md](16-cost-and-scaling.md).

Versions and prices were checked on **8 October 2026**. Reconfirm before scaffolding. Items marked **Verified** come from the cited primary page that day. Items marked **Assumption** were not re-read from a primary page in this session.

## Chosen core

| Technology | Purpose | MVP | Complexity | Cost shape |
| --- | --- | --- | --- | --- |
| Next.js 16.4.x, React, TypeScript | Product UI, App Router | Required | Medium | Hosting only |
| Tailwind CSS and shadcn/ui | Styling and accessible components | Required | Low | None |
| NestJS 12, TypeScript | HTTP API and worker | Required | Medium | Hosting only |
| OpenAPI via `@nestjs/swagger` 12 | Contract and admin inspection | Required | Low | None |
| PostgreSQL 18 + pgvector 0.8.7 | System of record, FTS, vectors | Required | Medium | Disk and RAM |
| Drizzle ORM, stable 0.45.x line | SQL access and migrations | Required | Low | None |
| Redis 7 | Queue backend, cache, rate limits | Required | Low | Small RAM |
| BullMQ, used directly | Jobs, retries, dead letters | Required | Low | None |
| Zod | Shared validation | Required | Low | None |
| AWS SDK v3 | S3 API for MinIO and production buckets | Required | Low | Storage |
| MinIO locally; S3-compatible in production | Original files and audio | Required | Low locally | Per GB |
| Hosted Claude and OpenAI APIs | Chat, extraction, embeddings | Required | Low | Usage |
| Caddy | HTTPS reverse proxy | Production | Low | None |
| Docker Compose | Local and single-server production | Required | Low | None |
| GitHub Actions | CI | Required | Low | Free tier for small repos |
| OpenTelemetry SDK + Langfuse | Traces and LLM traces | Langfuse cloud in MVP; full OTel in P6 | Medium | Hobby tier, then usage |

## Version notes (verified 2026-10-08)

- **Next.js 16.4.0** was published 7 October 2026. The 16.4 announcement lists React 19.3. The September 2026 security line called 16.3.8 Active LTS. Scaffold with the latest patched 16.4.x and read the release notes. Source: GitHub release `v16.4.0`, nextjs.org.
- **NestJS 12.0.0** was published 27 August 2026. It requires Node.js 20.19+ or 22.12+. Use Node 22 LTS. Source: `nestjs/nest` release `v12.0.0`.
- **`@nestjs/swagger` 12.0.2** targets Nest 12 and is ESM. Node 20.19+ or 22.12+. Source: package metadata and 12.0.2 release notes.
- **pgvector 0.8.7** (1 October 2026) supports HNSW and IVFFlat, `vector` up to 2,000 dimensions, `halfvec` up to 4,000, iterative index scans, and cosine distance. Postgres 12 is unsupported. Source: pgvector changelog and README.
- **Prisma 7.10.0** is a current stable line; Prisma 8 was in release candidate around September 2026. **Drizzle** stable was reported as 0.45.2 on 6 September 2026 by a secondary comparison; 1.0 was in beta. Pin the stable line at install time. Drizzle documents `vector` columns and HNSW indexes. Prisma can store pgvector but similarity search has historically required raw SQL. Source: Prisma 7.10.0 release; Drizzle vector guide; secondary version note flagged as such.
- **`@nestjs/bullmq` 11.0.5** (7 August 2026) declared peers for Nest 10 and 11 only. **Assumption:** a Nest 12 build of that package may lag. Use BullMQ from a thin Nest provider until the official package lists Nest 12. BullMQ itself is supported through major 6 in that package's peers.
- **LangGraph JS v1** and **LangChain JS v1** are stable. LangChain's agent helper runs on LangGraph. They are not adopted. Source: LangChain JS docs, retrieved 2026-10-08.
- **OpenAI is winding down the fine-tuning platform for new users** as stated on the pricing page retrieved 2026-10-08. This reinforces the decision not to depend on fine-tuning.

## Frontend libraries to allow

| Library | Why | MVP |
| --- | --- | --- |
| Next.js, React, TypeScript | Required stack | Yes |
| Tailwind CSS 4 | Default styling. **Assumption:** create-next-app on Next 16 still scaffolds Tailwind 4; confirm at init | Yes |
| shadcn/ui | Copy-in components on Radix. Not a runtime dependency to upgrade blindly | Yes |
| Zod | Forms and shared contracts | Yes |
| React Hook Form | Wizard and settings forms | Yes |
| Native `fetch` and `EventSource` | API and SSE. No client data library until a screen needs cache invalidation | Yes |
| TanStack Query | Add when the review inbox and job polling duplicate server state | Phase 2 if polling gets messy |

Do not add Redux, a second component kit, or a chat SDK.

## Backend libraries to allow

| Library | Why | MVP |
| --- | --- | --- |
| NestJS platform-express | HTTP. Fastify is a later option if CPU shows up in profiles | Yes |
| Drizzle and `postgres` (postgres.js) or `pg` | SQL | Yes |
| BullMQ and ioredis | Queues | Yes |
| Argon2 | Password hashing | Yes |
| otplib or equivalent maintained TOTP library | MFA. Pin a maintained package at implementation | Yes |
| Zod | DTO validation. Nest 12 can reflect Standard Schema into OpenAPI | Yes |
| `@aws-sdk/client-s3` and presigner | Uploads | Yes |
| `mammoth` | DOCX to text | Yes |
| `unpdf` or `pdfjs-dist` | Digital PDF text. Scanned PDFs wait for OCR | Yes |
| `exifr` | Image metadata when images are enabled | P5 |
| `sharp` | Image normalization | P5 |
| Official Anthropic and OpenAI SDKs | Provider calls | Yes |
| ClamAV daemon (`clamd`) | Malware scan sidecar | Yes |
| OpenTelemetry SDK for Node | Traces | P6; manual structured logs in MVP |

## Evaluated and deferred

### Python and FastAPI

**Purpose:** OCR, diarization, local Whisper, document layout models.

**Why not MVP:** Digital PDF, DOCX, and chat exports are solvable in Node. A second runtime doubles the deploy and the security boundary around personal data.

**Trigger to add:** scanned documents in Version 1, or speaker diarization / a local speech model in Version 2 when hosted APIs are not enough. One FastAPI process, called only by the worker, with no public ingress.

**Complexity:** medium. **Cost:** another container and RAM. **Simpler alternative for Version 1:** a Node PDF parser. Speech stays out of Version 1.

### LangChain JS and LangGraph JS

**Purpose:** model wrappers, tools, and durable agent graphs.

**Why not MVP:** the pipeline is a known sequence of jobs. Chat is one retrieval call plus one completion. Frameworks would hide prompts and make provider allowlists harder to audit.

**Trigger:** a workflow with long-lived human interrupts that BullMQ job state cannot represent cleanly. Even then, prefer LangGraph without LangChain.

### Dedicated vector database

**Purpose:** larger-than-Postgres approximate search.

**Why not MVP:** pgvector 0.8 HNSW on the same rows as permissions and filters is the right join. A second store would duplicate deletion and authorization.

**Trigger:** p95 vector latency misses its SLO after index tuning, or a single persona exceeds several million chunks. See [09-rag-pipeline.md](09-rag-pipeline.md).

### Kafka, Kubernetes, microservices

Not justified below the 100,000-user sketch, and not automatically then. See [16-cost-and-scaling.md](16-cost-and-scaling.md).

### Local open-weight LLMs

**Purpose:** residency and unit-cost at high volume.

**Why not MVP:** GPU operations, evaluation, and safety work exceed the product risk they remove. Hosted models with a named processor and a no-training contract setting are the default.

**Trigger:** a residency requirement the chosen API cannot meet, or a measured bill where GPU ownership is cheaper after evaluation quality matches. See decision 9 in [20-technical-decisions.md](20-technical-decisions.md).

## Vision (Version 1 Phase 5)

| Capability | Choice when Phase 5 starts | Notes |
| --- | --- | --- |
| Vision | A short-context multimodal call on the allowlisted provider | One description per image, human confirmation before retrieval |

## Speech (Version 2 only — do not implement in Version 1)

| Capability | Planned choice when Version 2 opens | Notes |
| --- | --- | --- |
| Batch transcription | OpenAI `gpt-4o-mini-transcribe`, listed estimate **$0.003 / minute** on the pricing page | Whisper-compatible behavior is not required if this model is accurate on Bangla and English. Keep the interface swappable |
| Legacy Whisper | `whisper-1` at **$0.006 / minute** | Fallback if quality is better |
| Live transcription | `gpt-realtime-whisper` at **$0.017 / minute** | Version 2 duplex only |
| TTS | `tts-1` at **$15 / 1M characters**; `tts-1-hd` at **$30 / 1M characters** | Stock voices, not cloning |
| Duplex realtime | `gpt-realtime-2.1-mini` audio **$10 / $20 per 1M tokens** | Do not use the full realtime model until latency requires it. Cost is easy to underestimate |

Do not add speech SDK dependencies, microphone UI, or audio WebSocket routes to the Version 1 codebase. Reconfirm prices when Version 2 starts.

Prices: OpenAI API pricing and model pages, retrieved 8 October 2026. The embedding model page lists `text-embedding-3-small` at **$0.02 / 1M tokens** and `text-embedding-3-large` at **$0.13 / 1M tokens**. The page layout also shows a "Batch API price" heading near those figures. Use $0.02 as the planning rate and reconfirm standard versus batch at implementation.

## Model assignment

| Task | Default model | Why |
| --- | --- | --- |
| Conversation | Claude Sonnet 5.5, **$2 / $10 per MTok** | Quality at a moderate price. Cache hits on Sonnet 5.5 are **$0.10 / MTok** (0.05× input) |
| Extraction JSON | Claude Haiku 5.5, **$0.10 / $0.50 per MTok** under 100k input | Cheap structured output. Over 100k input the rate rises to **$0.50 / $2.50** |
| Embeddings | `text-embedding-3-small`, 1536 dimensions | Cheap, sufficient for personal-scale corpora. **Assumption:** the `dimensions` parameter still allows shortening; do not shorten in MVP |
| Alternate conversation | `gpt-6.1-sol` short context **$2 / $10 per MTok**, cached input **$0.10** | Same price band if Anthropic is declined |
| Alternate extraction | `gpt-6-luna` short context **$0.10 / $0.50** | Same band as Haiku 5.5 |

Anthropic rates: Claude API pricing page, retrieved 8 October 2026. OpenAI flagship standard rates from the first pricing table on the same date: `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6-astra`. Long-context rates are higher; keep prompts under the short-context threshold. Do not call `gpt-6-astra` or Claude Fable from the product path; they are **$10 / $50 per MTok** and are not justified.

Provider data-use settings must disable training on customer content where the vendor offers that control. Record the setting name in the runbook at implementation. This plan does not claim a particular contractual zero-retention product unless it is turned on and verified.

## Observability

- MVP: structured JSON logs, request ids, and the Langfuse JS SDK pointed at Langfuse Cloud. The pricing page retrieved 8 October 2026 lists a free Hobby plan with 50k units and 30-day history. Do not send raw source documents; send prompt templates hashes, token counts, retrieval ids, and redacted previews in development only.
- Production alternative: self-hosted Langfuse (MIT, unlimited usage) adds ClickHouse, Redis, Postgres, and object storage. That stack is too heavy for the MVP server. Source: Langfuse self-hosting docs.
- NestJS 12 ships `@nestjs/observe`. Use it in Phase 6 when the HTTP, queue, and provider spans should share one OpenTelemetry pipeline. Source: NestJS 12 release notes.

## What lives where

| Store | Holds | Does not hold |
| --- | --- | --- |
| PostgreSQL | Users, consent, files metadata, messages, memories, chunks, embeddings, jobs status | File bytes, session rate counters |
| Redis | BullMQ payloads (ids, not file bodies), rate limits, SSE fanout tokens if needed, short cache of persona cards | System of record |
| Object storage | Originals, normalized text sidecars, quarantine; TTS audio only in Version 2 | Permissions |
| Browser | UI state, in-progress upload | Long-term secrets |

Job payloads contain foreign keys. Workers load bytes from object storage.
