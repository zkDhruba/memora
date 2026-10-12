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
| [docs/22-membership-and-persona-lifecycle.md](docs/22-membership-and-persona-lifecycle.md) | Plans (Free/Pro/Pro+), persona CRUD, chat listing |
| [PROGRESS.md](PROGRESS.md) | Version 1 checklist — mark tasks done as you ship |

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

## Repo layout (Phase 1+)

```text
apps/web       Next.js 16 App Router
apps/api       NestJS 12 API
packages/db    Drizzle schema (migrations in 1.3)
packages/shared  Shared Zod contracts
infra/         Docker Compose (Phase 1.2)
docs/          Architecture and planning
PROGRESS.md    Version 1 checklist
```

## Develop

```bash
corepack enable
pnpm install
pnpm check          # build + typecheck
pnpm dev            # web :3000 + api :4000 (after install)
```

Track progress in [PROGRESS.md](PROGRESS.md). **Golden rule:** every finished task includes a **How to test** section (commands + expected result) in chat and under “How to test completed tasks” in that file.

## Status

Phase **1.1** monorepo scaffold is in place. Planning docs remain the source of product decisions. Pricing/library notes in docs were checked 8 October 2026 — reconfirm before production.

This plan is engineering guidance. It is not legal advice. Deployment in Bangladesh or any other jurisdiction needs counsel review against [docs/14-security-privacy-consent.md](docs/14-security-privacy-consent.md).
