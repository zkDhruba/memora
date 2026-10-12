# 20 — Technical decisions

Related: [04-technology-stack.md](04-technology-stack.md), [06-ai-architecture.md](06-ai-architecture.md).

Each decision has one default. Change it only when the stated condition is true.

## 1. Monorepo, not many repositories

**Choice:** one repository, pnpm workspaces.

**Alternative:** split web, API, and infra repositories.

**Why:** the contract types, schema, and prompts change together. A small team should not version them across repos.

**Tradeoff:** CI runs more often.

**Revisit when:** an external group needs to consume only one package and access control cannot be done with folders.

## 2. Turborepo, not Nx

**Choice:** Turborepo.

**Alternative:** Nx.

**Why:** the graph is four packages. Turborepo caches `lint`, `test`, and `build` with less generator surface.

**Tradeoff:** fewer code generators.

**Revisit when:** the repo grows past roughly ten deployable apps or needs affected-project computation that Turborepo is failing to express.

## 3. Drizzle, not Prisma

**Choice:** Drizzle ORM on the stable 0.45 line. Pin the exact version at scaffold. Do not adopt the 1.0 beta.

**Alternative:** Prisma 7.10.

**Why:** chat and ingestion need SQL for hybrid search, HNSW, full-text, and RLS session variables. Drizzle's documented `vector` columns and cosine helpers match that. Prisma can store vectors but similarity queries have required raw SQL, which removes much of Prisma's benefit.

**Tradeoff:** less polished nested-write API. Repositories will be explicit, which is desirable here.

**Revisit when:** Prisma ships first-class filtered vector queries and migrations that the team prefers, and a spike shows equal control over `SET LOCAL`.

## 4. pgvector, not a dedicated vector database

**Choice:** pgvector 0.8.7 on PostgreSQL 18, HNSW, cosine, 1536 dimensions.

**Alternative:** Qdrant, Pinecone, Weaviate, or pgvectorscale later.

**Why:** filters, deletion, and transactions stay with the chunks. Personal corpora are small. A second store will drift during purge.

**Tradeoff:** HNSW build memory and approximate recall need tests.

**Revisit when:** retrieval p95 stays above 300 ms after iterative scans and `ef_search` tuning, on a corpus that represents production.

## 5. Provider SDKs, not LangChain

**Choice:** official Anthropic and OpenAI SDKs behind `LlmPort`.

**Alternative:** LangChain JS.

**Why:** two providers and no tools. A wrapper framework hides the allowlist and the prompt.

**Tradeoff:** more hand-written streaming code.

**Revisit when:** a third provider is added and the port is growing duplicate retry logic that a thin library would cover. Still avoid pulling retrieval into that library.

## 6. Deterministic jobs, not LangGraph

**Choice:** BullMQ stages and a straight chat function.

**Alternative:** LangGraph JS.

**Why:** the control flow is known. Human review is a database status, not a paused agent.

**Tradeoff:** no built-in graph checkpoint UI.

**Revisit when:** a workflow must pause mid-model-call for days and resume with partial LLM state that job rows cannot store cleanly.

## 7. NestJS workers, not a Python service

**Choice:** Node worker for all MVP AI steps.

**Alternative:** FastAPI sidecar.

**Why:** parsers and JSON extraction do not need Python. One language simplifies hiring and tracing.

**Tradeoff:** OCR and diarization are weaker.

**Revisit when:** scanned PDFs or speaker diarization are committed features. Add one private Python process then.

## 8. Single completion, not multi-agent

**Choice:** one chat completion. Extractors are offline jobs.

**Alternative:** writer plus critic plus safety agent.

**Why:** extra agents add latency, cost, and new hallucinations. Safety is policy, filters, and retrieval scope.

**Tradeoff:** some bad answers ship until the user corrects them.

**Revisit when:** gold-set unsupported-claim rate stays high after abstention rules, and a critic prompt reduces it in an offline eval without damaging abstention.

## 9. Hosted models, not self-hosted weights

**Choice:** Claude Sonnet 5.5 for chat, Claude Haiku 5.5 for extraction, OpenAI `text-embedding-3-small` for embeddings. OpenAI `gpt-6.1-sol` and `gpt-6-luna` are the alternate pair if Anthropic is not acceptable. One pair per persona, chosen in consent.

**Alternative:** local open-weight inference.

**Why:** quality, Bangla coverage, and operational load. Embeddings are cheap. Fine-tuning is not a plan; OpenAI stated on 8 October 2026 that its fine-tuning platform is winding down for new users.

**Tradeoff:** data leaves the server. Cross-border transfer must be lawful.

**Revisit when:** counsel blocks foreign processing, or a 30-day invoice shows GPU ownership is cheaper and a local model passes the gold set.

## 10. RAG and a style card, not fine-tuning

**Choice:** retrieval, confirmed memories, and a compiled style card with excerpts.

**Alternative:** hybrid fine-tune plus RAG.

**Why:** deletion and citation. A weight file cannot forget one journal.

**Tradeoff:** style will be approximate.

**Revisit when:** Phase 4 human review says style is inadequate and a training method supports per-source deletion. That combination is rare; expect to stay with RAG.

## 11. REST, not GraphQL

**Choice:** REST and OpenAPI.

**Alternative:** GraphQL.

**Why:** the client is first-party. Streaming and uploads fit REST and SSE. Authorization is easier to audit on explicit routes.

**Tradeoff:** more endpoints.

**Revisit when:** several external clients need arbitrary nested reads. Not expected.

## 12. SSE for text, not WebSocket

**Choice:** `POST` with `text/event-stream` for chat tokens.

**Alternative:** WebSocket.

**Why:** the stream is one way. SSE works through Caddy with fewer state problems. Reconnect is "load the message."

**Tradeoff:** server-to-server push for typing indicators is clumsier. Typing indicators are omitted.

**Revisit when:** Version 2 needs audio frames on the same channel. That becomes a separate voice socket, not a change to the text path.

## 13. Voice is Version 2 (held)

**Choice for Version 1:** no voice. Text chat only. No STT, TTS, duplex socket, WebRTC, or voice-cloning work in the Version 1 backlog.

**Choice when Version 2 opens:** V2a uses upload and playback. V2b uses WebSocket audio to the API, which calls STT and TTS. WebRTC is still not the default.

**Alternative:** pull voice into Version 1, or start Version 2 with WebRTC.

**Why hold:** the product owner prioritized a solid conversational text experience first. Voice adds latency, cost, biometric/consent risk, and UI surface that would delay the MVP.

**Why WebSocket later, not WebRTC first:** WebRTC solves peer media and NAT. This product relays through the server to a provider. A socket is enough and is easier to authenticate with the session cookie.

**Tradeoff:** Version 1 users cannot speak to the simulation. Duplex later may have higher latency than a media server optimized for RTP.

**Revisit when:** Version 1 text chat is in use and the product owner opens Version 2. Within Version 2, revisit WebRTC only if measured time-to-first-audio stays above about 800 ms after provider streaming is already in use.

## 14. Relationship tables, not a graph database

**Choice:** `relationships` rows and foreign keys. Recursive CTE if a family tree view needs ancestors.

**Alternative:** Neo4j.

**Why:** graphs here are dozens of people, not a social network.

**Tradeoff:** path queries are less elegant.

**Revisit when:** relationship queries are a measured hotspot. Unlikely.

## 15. S3-compatible storage

**Choice:** S3-compatible object store in development via Compose (`pgsty/silo` — MinIO API drop-in after `minio/minio` left Docker Hub). Managed S3-compatible storage in production (Hetzner Object Storage or AWS S3). Same AWS SDK.

**Alternative:** files on the VM disk.

**Why:** presigned uploads, versioning, and a failure domain separate from Postgres.

**Tradeoff:** another account to bill.

**Revisit when:** never for the primary bytes. Disk is acceptable only for a disposable demo.

## 16. Modular monolith, not microservices

**Choice:** one API image and one worker process, same modules.

**Alternative:** ingestion service, chat service, and a bus such as Kafka.

**Why:** the hard problems are data boundaries and prompts, not independent scaling of teams.

**Tradeoff:** a bad migration can take the chat path down. Mitigate with health checks and small releases.

**Revisit when:** the worker's CPU starves the API on a split deployment already, and separate release cadences are required. Splitting the worker binary is still not Kafka.

## Supporting defaults

| Topic | Default |
| --- | --- |
| Node | 22 LTS, minimum 22.12 because Nest 12 allows it |
| HTTP adapter | Express |
| Validation | Zod |
| Passwords | Argon2id |
| Sessions | Server-side, cookie hash |
| Queue | BullMQ used directly until `@nestjs/bullmq` declares Nest 12 support |
| Full text | `simple` for Bangla, `english` for English |
| Email | SMTP provider in production, Mailpit locally |
| Package manager | pnpm |
| Conversation modality in Version 1 | Text only (SSE chat) |
| Voice | Version 2 |
| Account plans | `free` / `pro` / `pro_plus` with max owned personas 1 / 5 / 20 |
| Chat memory by plan | Free 100 / Pro 1,000 / Pro+ 10,000 messages (user↔persona); conversational only |
| Daily sent texts by plan | Free 25 / Pro 100 / Pro+ unlimited; user messages only; all personas |
| Plan enforcement | Single `PlanGuard` + `plans.limits` JSONB for future rules |
| Persona → chat | Create lists persona in Chat immediately; no publish step |
| Data feeding | Anytime, additive; new sources accumulate; no corpus wipe on new upload |
| Billing provider | Deferred; admin assigns plans until then |
