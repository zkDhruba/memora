# 19 — Implementation task breakdown

Related: [18-development-roadmap.md](18-development-roadmap.md), [12-api-design.md](12-api-design.md), [11-database-design.md](11-database-design.md).

Ordered so that privacy and tenancy exist before features that move personal data. IDs are the backlog order inside each phase.

## Phase 1

| ID | Task | Done when |
| --- | --- | --- |
| 1.1 | pnpm workspace, Turborepo, `apps/web`, `apps/api`, `packages/db`, `packages/shared`, strict TypeScript | `pnpm check` runs typecheck |
| 1.2 | Compose: Postgres pgvector, Redis, MinIO, Mailpit, ClamAV | Health URLs respond |
| 1.3 | Drizzle migrations: users, sessions, mfa, audit, personas, memberships, consents | Migration applies twice without error |
| 1.4 | Argon2id register, verify, login, reset, cookie session | Mailpit receives mail |
| 1.5 | TOTP and recovery codes | Step-up required for delete |
| 1.6 | Persona wizard API and UI, self attestation, consent rows | Persona stays draft until consent |
| 1.7 | Membership checks and 404 for strangers | Integration test |
| 1.8 | Audit inserts for auth and consent | Rows visible to the actor |
| 1.9 | App shell, empty states, disclosure component used on a placeholder chat page | Keyboard navigation works |
| 1.10 | CI: typecheck and unit tests | Green on a pull request |

## Phase 2

| ID | Task | Done when |
| --- | --- | --- |
| 2.1 | File and import tables, presign, complete | Object lands in quarantine |
| 2.2 | Scan job and status | EICAR fails |
| 2.3 | BullMQ connection, generation, dead letter | Retry test |
| 2.4 | Text and Markdown parser | Fixture |
| 2.5 | DOCX and digital PDF | Scanned PDF marks `needs_ocr` |
| 2.6 | WhatsApp parser and subject mapping UI | Both date fixtures |
| 2.7 | Participant rows default `other` to not retrievable | Flag test |
| 2.8 | Chunker per [09-rag-pipeline.md](09-rag-pipeline.md) | Unit tests |
| 2.9 | Import progress page | Polling stops on terminal state |
| 2.10 | Reprocess and purge | Chunk count returns to zero |

## Phase 3

| ID | Task | Done when |
| --- | --- | --- |
| 3.1 | `LlmPort` and Anthropic adapter, provider guard | Call refused without consent |
| 3.2 | Embedding adapter and HNSW migration | Vector insert and order by cosine |
| 3.3 | Deterministic style stats and Haiku trait drafts with quote check | Fake quote dropped |
| 3.4 | Memory extractor and domain check | Conversational insert into biographical fails |
| 3.5 | Review inbox | Confirm makes `retrieval_allowed` |
| 3.6 | Hybrid retrieval with audience filter | Sentinel test |
| 3.7 | Prompt builder and token trimmer | Budget unit test |
| 3.8 | SSE chat and persistence | Disconnect does not corrupt the row |
| 3.9 | Citations and abstention rewrite | Must-abstain fixture |
| 3.10 | Conversational memory writer | Invisible to biographical search |
| 3.11 | Quotas and usage rows | 429 when exceeded |
| 3.12 | Playwright happy path with fake LLM | CI |
| 3.13 | Staging deploy on one VM, spend alert | Documented env |

## Phase 4

| ID | Task |
| --- | --- |
| 4.1 | Relationships and claims approval |
| 4.2 | Audience-specific traits in the compiled card |
| 4.3 | Conflict records and UI |
| 4.4 | Profile version history |
| 4.5 | Bangla and English gold cases |
| 4.6 | Eval runner writing `evaluation_runs` |
| 4.7 | Email and Telegram parsers |
| 4.8 | Owner export |
| 4.9 | Calibration page: compare reply to an excerpt without calling the excerpt the truth |

## Phase 5 (images only)

| ID | Task |
| --- | --- |
| 5.1 | Allow image upload, EXIF, no model call |
| 5.2 | Vision description stored as unconfirmed |
| 5.3 | Human confirm/reject caption; only confirmed text is retrievable |
| 5.4 | Link a confirmed image description to a memory |

Audio and video uploads remain rejected (`415`) in Version 1.

## Phase 6

| ID | Task |
| --- | --- |
| 6.1 | Admin user disable, job retry, usage |
| 6.2 | Persona suspend and dispute |
| 6.3 | Backup and a recorded restore |
| 6.4 | OTel traces for HTTP and jobs |
| 6.5 | k6 baseline |
| 6.6 | Revoke-consent UX that cancels jobs |
| 6.7 | Runbook |

## Version 2 — Voice (do not start in Version 1)

| ID | Task |
| --- | --- |
| V2.1 | Batch recording upload → transcription → existing text chat path |
| V2.2 | Stock TTS of the assistant message with a synthetic label |
| V2.3 | Cost probe: dollars per voice minute documented before enablement |
| V2.4 | WebSocket duplex behind a flag, barge-in stops audio |
| V2.5 | Audio and video source ingestion that depends on transcription |
| V2.6 | Synthetic voice design only, default off, living-subject consent |

## First coding session

Start at task 1.1 and stop at 1.7 before any model key is added. Do not build the chat screen beyond the disclosure placeholder until 3.6 is tested. Do not scaffold voice routes, audio players, or speech provider adapters until Version 2 is opened.
