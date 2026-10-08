# 17 — Testing and evaluation

Related: [06-ai-architecture.md](06-ai-architecture.md), [07-personality-engine.md](07-personality-engine.md), [09-rag-pipeline.md](09-rag-pipeline.md).

## Frameworks

| Layer | Tool | Why |
| --- | --- | --- |
| Unit and integration | Vitest | Nest 12's new-app default is moving toward Vitest; it is fast and TypeScript-native. Jest remains acceptable if the Nest 12 generator emits Jest. Pick one at scaffold time and do not mix |
| HTTP | Supertest against the Nest app | Authz and error shapes |
| Database | Testcontainers or Compose Postgres with pgvector | Migrations and RLS |
| End-to-end | Playwright | Register, upload, review, chat |
| Load | k6 against read endpoints and a mocked LLM | Do not load-test the paid model |
| AI traces | Langfuse datasets later | Phase 4 |

The LLM is mocked in CI. A nightly job may call the real model on a tiny frozen set if a key is present. Pull requests must pass without network calls to providers.

## Test layers

### Unit

Parsers (WhatsApp fixtures for both date formats), chunker, rank fusion, quote verifier, audience filter, token budget trimmer, consent guard, abstention post-check.

### Integration

- Migration applies on empty Postgres.
- RLS: a session scoped to persona A cannot `SELECT` persona B chunks.
- Purge removes chunks and embeddings.
- Job idempotency: the same generation does not double-insert messages.
- Chat service with a fake `LlmPort` returns citations only from the fake retriever.

### End-to-end

One happy path: verified user, self persona, consent, upload a fixture chat, confirm one memory, ask a question, see a citation and the disclosure banner. One denied path: a second user receives 404 for that persona.

### Authorization matrix

A table-driven test for owner, manager, contributor, participant, stranger, and admin across read memory, upload, chat, delete file, and admin job list. Admin must fail content reads.

### Prompt injection

Fixture documents containing instruction overrides, fake system prompts, and requests to print other personas' data. Assert the stored system prompt is not in the answer and persona B's sentinel string is absent.

### Privacy leakage

Two personas with unique sentinel sentences. For 20 questions, no sentinel crosses the boundary. Third-party speaker text is absent from embeddings (`retrieval_allowed = false`).

### Job resilience

Kill the worker mid-parse. On restart, the job finishes once. A failing extractor lands in the dead-letter state and the file shows `needs_attention`.

### Load

k6: 50 concurrent `GET /health/ready` and library list with the LLM mocked. Chat load uses the fake provider. Target: no 500s and retrieval under 300 ms on the MVP dataset.

## AI evaluation

Keep three splits of **authorized** material the product owner supplies for testing, or synthetic personas clearly marked as fiction:

| Split | Use |
| --- | --- |
| Configure | Shown in the product as sources for the test persona |
| Dev | Used while changing prompts |
| Gold | Touched only when scoring a release |

Do not tune prompts on gold. Do not use real users' data in gold without a written eval consent that is separate from product consent.

### Cases

Each case has a question, allowed evidence ids, an expected behavior (`answer`, `abstain`, `dispute`), and a forbidden claim list.

| Metric | How | MVP bar |
| --- | --- | --- |
| Factual support | Judge whether each biographical claim is entailed by a cited passage. Human on gold; an LLM judge may pre-screen dev only | No unsupported claim on gold abstain/answer set |
| Retrieval recall | Relevant chunk id in top 8 | Track, set a numeric bar after the first gold set exists |
| Abstention | Must-abstain cases | 100% on the small gold abstain list |
| Citation validity | Markers map to real ids | 100% |
| Persona isolation | Sentinel test | 100% |
| Style | Blind human preference between a plain answer and the styled answer, on dev only | Qualitative. No public percentage |
| Relationship | Wrong-audience fact excluded | 100% on fixture |
| Privacy | Third-party sentence absent | 100% |
| Coherence | Multi-turn fixture does not contradict the session summary | Spot-check |
| Latency and tokens | From usage records | Within budget defaults |
| User rating | Thumbs in product | Dashboard, not a release gate |

An LLM-as-judge is allowed for development triage. Release decisions on gold factual cases are human until the judge's agreement with humans is itself measured. Do not publish a "92% the same person" score.

### Regression

Prompt template version and model id are stored on each run. A change to either reruns gold before production. Failures on isolation, abstention, or citation validity block release. Style preference does not.

## Personality consistency

Compare confirmed traits to the answer with a checklist: greeting present or absent as specified, banned phrase absent, language matches the user when both languages are configured. This is a rubric, not a psychometric instrument.

## Parser fixtures

Store small synthetic WhatsApp, Telegram, and PDF files in `packages/shared/fixtures` during implementation. No real personal data in git.
