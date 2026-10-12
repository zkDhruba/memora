# Project plan

Memora Version 1 is a text-conversation product: evidence-grounded chat with a disclosed AI simulation. Voice interaction, speech-to-text conversation, text-to-speech playback, duplex audio, and synthetic voice cloning are held for **Version 2**.

## Smallest usable MVP

Phases 0 through 3. A living person can create an account on Free (1 owned persona; Pro 5; Pro+ 20), CRUD personas fed by uploads, see each created persona in Chat immediately, upload text documents and a chat export, review extracted traits and memories, and have a streaming text conversation that cites sources and is visibly labeled as a simulation.

Out of the MVP: voice of any kind, image understanding, OAuth if it slips, representative legacy workflows beyond the data model, administrator content review, and multi-provider automatic failover.

Legacy creation (Scenario B) is in the data model from Phase 1 so the consent tables exist, and becomes a supported product flow in Phase 4 after the authorization review states are implemented.

## Phase summary (Version 1)

| Phase | Outcome | Relative size |
| --- | --- | --- |
| 0 | This planning set, provider choice, threat model, eval design | Done as documentation |
| 1 | Monorepo, auth, persona CRUD, plan caps (1/5/20), chat picker, storage, database | Medium |
| 2 | Uploads, parsers, jobs, chunks, embeddings, source registry | Large |
| 3 | Personality card, memories, RAG **text** chat, citations, disclosure | Large |
| 4 | Relationships, conflicts, calibration, evaluation harness | Large |
| 5 | Image understanding only (no voice) | Medium |
| 6 | Consent operations, abuse review, load tests, production deploy | Medium |

## Version 2 (next product version)

Held until Version 1 text chat is stable in use:

- Batch speech-to-text into a text conversation
- Stock text-to-speech playback of replies
- Real-time duplex voice with barge-in
- Consented custom synthetic voice (living subject only; legacy cloning stays off until a separate design)
- Audio and video source uploads that depend on transcription (call recordings, voice notes)

Full acceptance criteria: [docs/18-development-roadmap.md](docs/18-development-roadmap.md). Ordered tasks: [docs/19-implementation-task-breakdown.md](docs/19-implementation-task-breakdown.md).

## Build order inside the MVP

1. Database, sessions, plan catalog, subscriptions, and persona membership.
2. Persona CRUD + PlanGuard (Free 1 / Pro 5 / Pro+ 20) and Chat picker listing.
3. Consent record and disclosure copy before any upload endpoint.
4. Object storage upload with validation and malware scan.
5. One parser (plain text and Markdown), then WhatsApp `.txt`, then PDF and DOCX.
6. Chunk, embed, and store provenance.
7. Human-reviewed personality card and biographical memories.
8. Streaming **text** chat with retrieval filters and citations.
9. Deletion that removes derived chunks, embeddings, and memories.

The Chat **picker** ships in Phase 1; streaming model replies wait until retrieval is persona-scoped and tested. Do not start voice work until Version 2 is opened.

Membership and persona lifecycle: [docs/22-membership-and-persona-lifecycle.md](docs/22-membership-and-persona-lifecycle.md).

## Default assumptions

Recorded in [docs/21-risks-and-open-questions.md](docs/21-risks-and-open-questions.md). The plan proceeds with these defaults:

- First market can include Bangladesh; counsel must confirm the Personal Data Protection Act, 2026, before production processing.
- The first persona owner is a living adult creating a twin of themselves.
- Hosted models are allowed if the owner accepts the named provider in the consent record.
- English and Bangla are the first languages. The model must be evaluated on Bangla before calling multilingual support done.
- One persona belongs to one owning account, with additional members by explicit grant.
- Chat exports do not authorize exposing other participants' private messages to new people.
- Conversation means text until Version 2.
- New accounts are Free (1 owned persona; last **100** chat messages remembered). Pro: 5 personas / **1,000** messages. Pro+: 20 / **10,000**. Further plan rules TBD. Retention is conversational only — uploaded life data is not wiped by this cap.
- Personas may be fed more data at any time; new sources accumulate and do not replace prior confirmed knowledge.
