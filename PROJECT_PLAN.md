# Project plan

Memora should be built as a small, evidence-grounded conversation product before voice, images, or custom synthetic speech.

## Smallest usable MVP

Phases 0 through 3. A living person can create an account, create one persona for themselves, upload text documents and a chat export, review extracted traits and memories, and have a streaming text conversation that cites sources and is visibly labeled as a simulation.

Out of the MVP: voice, image understanding, custom voice cloning, OAuth if it slips, representative legacy workflows beyond the data model, administrator content review, and multi-provider automatic failover.

Legacy creation (Scenario B) is in the data model from Phase 1 so the consent tables exist, and becomes a supported product flow in Phase 4 after the authorization review states are implemented.

## Phase summary

| Phase | Outcome | Relative size |
| --- | --- | --- |
| 0 | This planning set, provider choice, threat model, eval design | Done as documentation |
| 1 | Monorepo, auth, personas, dashboard shell, storage, database | Medium |
| 2 | Uploads, parsers, jobs, chunks, embeddings, source registry | Large |
| 3 | Personality card, memories, RAG chat, citations, disclosure | Large |
| 4 | Relationships, conflicts, calibration, evaluation harness | Large |
| 5 | Images, transcription, voice conversation, consented synthetic voice | Large |
| 6 | Consent operations, abuse review, load tests, production deploy | Medium |

Full acceptance criteria: [docs/18-development-roadmap.md](docs/18-development-roadmap.md). Ordered tasks: [docs/19-implementation-task-breakdown.md](docs/19-implementation-task-breakdown.md).

## Build order inside the MVP

1. Database, sessions, and persona membership.
2. Consent record and disclosure copy before any upload endpoint.
3. Object storage upload with validation and malware scan.
4. One parser (plain text and Markdown), then WhatsApp `.txt`, then PDF and DOCX.
5. Chunk, embed, and store provenance.
6. Human-reviewed personality card and biographical memories.
7. Streaming chat with retrieval filters and citations.
8. Deletion that removes derived chunks, embeddings, and memories.

Do not start the chat UI before retrieval is persona-scoped and tested.

## Default assumptions

Recorded in [docs/21-risks-and-open-questions.md](docs/21-risks-and-open-questions.md). The plan proceeds with these defaults:

- First market can include Bangladesh; counsel must confirm the Personal Data Protection Act, 2026, before production processing.
- The first persona owner is a living adult creating a twin of themselves.
- Hosted models are allowed if the owner accepts the named provider in the consent record.
- English and Bangla are the first languages. The model must be evaluated on Bangla before calling multilingual support done.
- One persona belongs to one owning account, with additional members by explicit grant.
- Chat exports do not authorize exposing other participants' private messages to new people.
