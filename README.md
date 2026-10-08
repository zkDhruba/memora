# Memora

Memora is an AI digital-twin and personality-reconstruction platform. An authorized person supplies records of a real individual's life and communication. The system builds a clearly disclosed AI simulation that can converse **in text** in a documented style, retrieve evidence-linked memories, and respect per-person access limits. Voice is planned for Version 2, not Version 1.

This repository currently contains the architecture and implementation plan. Application code has not been started.

## Read this first

| Document | Purpose |
| --- | --- |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Phased build summary and the smallest usable MVP |
| [ARCHITECTURE.md](ARCHITECTURE.md) | High-level system description |
| [docs/20-technical-decisions.md](docs/20-technical-decisions.md) | Locked technology choices |
| [docs/18-development-roadmap.md](docs/18-development-roadmap.md) | Phase objectives and acceptance criteria |
| [docs/19-implementation-task-breakdown.md](docs/19-implementation-task-breakdown.md) | Ordered engineering backlog |

The full planning set is in [docs/](docs/). Diagrams are in [docs/diagrams/](docs/diagrams/).

## What Memora is

- A simulation grounded in uploaded, authorized material.
- A system that cites evidence and refuses to invent personal memories as facts.
- A product with two principal modes: a living person's own twin, and a digital legacy created by an authorized representative.

## What Memora is not

- Not the original person, and not a claim of continued consciousness.
- Not a channel to the dead, and not an afterlife product.
- Not a fine-tuned psychological identity. Similarity scores are engineering metrics, not proof of personhood.

## Recommended stack

TypeScript modular monolith: Next.js, NestJS, PostgreSQL with pgvector, Redis, BullMQ, S3-compatible object storage, and hosted LLM APIs behind an explicit provider allowlist. See [docs/04-technology-stack.md](docs/04-technology-stack.md).

## Status

Planning complete as of 8 October 2026. Pricing and library versions in the docs are dated to the sources checked that day. Reconfirm rates and package majors before scaffolding.

This plan is engineering guidance. It is not legal advice. Deployment in Bangladesh or any other jurisdiction needs counsel review against [docs/14-security-privacy-consent.md](docs/14-security-privacy-consent.md).
