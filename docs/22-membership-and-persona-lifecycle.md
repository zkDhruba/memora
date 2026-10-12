# 22 — Membership tiers and persona lifecycle

Related: [02-product-requirements.md](02-product-requirements.md), [03-feature-specification.md](03-feature-specification.md), [11-database-design.md](11-database-design.md), [12-api-design.md](12-api-design.md), [13-frontend-architecture.md](13-frontend-architecture.md).

This document locks the product rules for **persona CRUD**, **plan-based creation caps**, **chat availability**, and **continuous additive data feeding**. Further plan restrictions (storage, tokens, invites, etc.) are intentionally deferred; the data model must accept new limit keys without a redesign.

## Analysis of the requirement

| Requirement | Interpretation | Product rule |
| --- | --- | --- |
| CRUD persona using fed data | Users create, view, update, and delete personas. Knowledge comes from uploads and owner-entered fields, not from a separate “feed” product | Full persona CRUD in the user app. Data ingestion remains the source pipeline already planned |
| Membership tiers | Account-level subscription, not persona-level | `free` / `pro` / `pro_plus` on the account |
| Free ≤ 1 persona | Cap on **owned** personas | Count only rows where the user is `owner` and `deleted_at` is null |
| Pro ≤ 5 | Same | Same |
| Pro+ ≤ 20 | Same | Same |
| Other restrictions later | Unknown quotas and feature flags | Store limits in a versioned plan catalog (`limits` JSONB). Enforcement goes through one `PlanGuard` service |
| After create → available in chat | Persona must appear in the chat picker without a second “publish” step | Creating a persona adds it to the user’s chat list immediately. Sending messages still follows readiness and consent (see below) |
| Feed anytime, as much as wanted | Owner can keep uploading after create; no “finalize corpus” gate | Library stays open for the life of the persona (subject to future plan storage caps) |
| More data → more accurate | Extra authorized material improves recall and style when reviewed | Accuracy means better grounded simulation, not proof of identity. Review still required for traits/memories |
| New feed accumulates | New sources add to the knowledge base | Never wipe existing confirmed memories, traits, chunks, or embeddings just because a new file arrived |

### What “owned” means for the cap

- Creating a persona makes the creator `owner`. That increments their count.
- Being invited as manager, contributor, or participant **does not** count against the invitee’s create cap.
- Soft-deleted personas (14-day grace) **still count** toward the cap until purge completes, so users cannot free a slot by soft-delete alone and immediately create another. After hard purge, the slot frees.
- Restoring within the grace window does not create a second slot.

### Downgrade policy (default until you decide otherwise)

If a user downgrades and already owns more personas than the new plan allows:

1. No new persona creates (`403 PLAN_LIMIT_PERSONAS`).
2. Existing personas remain usable (chat and studio) so data is not stranded.
3. Account settings show “over limit — upgrade or delete personas to create new ones.”

Do not auto-delete personas on downgrade.

### Payment

MVP enforces the catalog and default every new account to `free`. Assigning `pro` / `pro_plus` can be admin-only or env-seeded until a payment provider is chosen. Stripe (or local equivalent) is Phase 6 or a dedicated billing phase — not a blocker for the limit engine.

## Plan catalog (locked numbers)

| Plan id | Display | Max owned personas | Chat memory retention | Sent texts / day | Notes |
| --- | --- | --- | --- | --- | --- |
| `free` | Free | **1** | **100** | **25** | Default for new accounts |
| `pro` | Pro | **5** | **1,000** | **100** | |
| `pro_plus` | Pro+ | **20** | **10,000** | **Unlimited** (`null`) | |

Chat memory retention and daily send caps are defined below. All three limit families are independent on the same plan.

Seed `limits` example:

```json
{
  "maxOwnedPersonas": 5,
  "maxChatMemoryMessages": 1000,
  "maxChatMessagesPerDay": 100,
  "maxMembersPerPersona": null,
  "maxUploadMbPerMonth": null,
  "features": { "legacyScenario": false, "export": false }
}
```

`null` means unlimited / not enforced. MVP **must** enforce `maxOwnedPersonas`, `maxChatMemoryMessages`, and `maxChatMessagesPerDay` (where non-null).

## Chat memory retention by plan

This limit applies only to **what the simulation remembers from Memora chats** with a given user. It does **not** shrink biographical knowledge from uploaded sources.

### What is limited

| In scope (plan retention) | Out of scope (not reduced by this limit) |
| --- | --- |
| Prior chat turns used as context for the next reply | Confirmed biographical memories from files |
| `domain = conversational` memories for that user↔persona | Personality traits and style card |
| Session summaries derived from those chats | Source library and embeddings |

### Unit and scope

- **Unit:** one **message** = one stored row in `conversation_messages` (user or assistant). System rows do not count.
- **Window:** the **most recent** `maxChatMemoryMessages` messages across all of that user’s sessions with that **persona** (not per session alone). Older messages fall out of the recall window.
- **Whose plan:** the **chatting user’s** subscription (participant on Free keeps a short window even if the persona owner is on Pro+). Rationale: retention is a benefit of the account using chat. Open to change later if you prefer owner’s plan.

### Defaults (changeable in the catalog)

| Plan | `maxChatMemoryMessages` | Rough meaning |
| --- | --- | --- |
| Free | **100** | After ~100 texts, earlier chat details drop out of what the persona “remembers” |
| Pro | **1,000** | Longer ongoing conversations |
| Pro+ | **10,000** | Long-running relationships with the simulation |

Exact Pro / Pro+ numbers are planning defaults. Free **100** matches your stated intent. Adjust via `plans.limits` without code redesign.

### Runtime behavior

1. When assembling chat context, load only messages (and conversational memories linked to those messages/sessions) inside the retention window.
2. Messages older than the window may remain in the database for the user’s own history UI **or** be hidden from history — **MVP default:** still listable in “past chats” for the user, but **excluded from model context and conversational retrieval**. Optional purge job can hard-delete older conversational memories later.
3. On plan upgrade, the window expands immediately; older stored messages become eligible again if still present.
4. On plan downgrade, the window shrinks on the next request; no need to delete rows immediately.
5. Token budget trimming still applies inside the window (last ~8 turns in the prompt, etc.). Retention is the **ceiling** of eligible history, not a promise that all 10,000 messages enter one prompt.

### UX copy

- Settings → Plan: “Chat memory: last 100 messages (Free)” with upgrade CTA.
- If the model cannot recall something outside the window: normal abstention / “not in our recent chats,” never invent it.
- Do not imply Free users’ uploads are forgotten — clarify “conversation memory” vs “life records you uploaded.”

## Daily sent-text limit by plan

Caps how many **user** chat messages an account may send per calendar day. This is a usage quota, separate from memory retention.

### Locked numbers

| Plan | `maxChatMessagesPerDay` |
| --- | --- |
| Free | **25** |
| Pro | **100** |
| Pro+ | **`null` (unlimited)** |

### Unit and scope

- **Unit:** one count = one successful `POST .../messages` from the user (the human’s text turn). Assistant replies do not count.
- **Day:** UTC calendar day unless product later picks the user’s `time_zone` from the profile. Document the choice in the UI (“resets at 00:00 UTC”).
- **Scope:** across **all** personas for that account (one Free user gets 25 texts total per day, not 25 per persona).
- **Whose plan:** the **sending user’s** subscription.

### Runtime behavior

1. Before accepting a chat send, `PlanGuard.assertCanSendChatMessage(userId)` loads today’s count from Redis (preferred) or `usage_records` / a small counter table.
2. If at cap → `429 PLAN_LIMIT_CHAT_DAY` with `{ plan, maxChatMessagesPerDay, usedToday, resetsAt }`.
3. Pro+ (`null`) skips the check.
4. Failed provider calls after the user message was persisted still count (the user spent a turn). Optional later: do not count if insert fails before stream starts.
5. Voice (Version 2) should use the same daily budget or a separate key — decide when Version 2 opens; until then text only.

### UX

- Composer shows remaining texts on Free/Pro when low (e.g. “3 of 25 left today”).
- At cap: disable send + upgrade CTA; do not silently drop the message.
- Settings → Plan lists daily send allowance next to memory and persona caps.

## Persona CRUD (user app)

| Operation | Who | Behavior |
| --- | --- | --- |
| **Create** | Any verified member under their plan cap | Wizard: scenario, names, languages, biography, attestation, consent, provider. Inserts persona + owner membership. Enforced by `PlanGuard.assertCanCreatePersona(userId)` |
| **Read (list)** | Session user | Dashboard and chat picker: all personas where the user has any membership |
| **Read (one)** | Member of that persona | Role-appropriate card |
| **Update** | Owner or manager | Profile fields, style notes, boundaries. Does not change ownership. Does not consume an extra plan slot |
| **Delete** | Owner | Soft delete → grace → purge of owned data. Frees the plan slot only after purge |

### Fed data (how a persona is built)

After create, the owner/manager/contributor feeds the persona through the existing ingestion and review path **at any time**, for as long as the persona exists:

1. Upload sources (chat exports, documents, notes) — repeatable, no lock after first import.
2. Pipeline extracts traits and memories → review.
3. Confirmed material powers RAG chat.
4. Upload more later; each successful import **adds** to what is already stored.

CRUD of the persona record is separate from CRUD of sources, memories, and traits (those stay as already specified).

## Continuous additive feeding (locked)

This is Scenario C from the product vision, stated as a hard product rule.

### Anytime

- There is no “seal persona” or “training complete” state that blocks new uploads.
- While status is `collecting`, `ready`, or after years of use, authorized users may open Library and add files.
- Chat remains available during and after new feeds. New material enters retrieval only after the normal pipeline (and review, where required).

### As much as wanted

- Product intent: owners may supply large, growing corpora.
- Engineering still has safety caps per file and per job (size, page count, chunk count) so one upload cannot melt the worker. Those are operational limits, not “you may only feed once.”
- Account-level storage or monthly upload caps may appear later under `plans.limits` (currently `null`). Until then, do not invent a silent “max sources per persona” product rule.

### More data → more accurate (with honesty)

- More **reviewed**, evidence-linked material generally improves factual answers, style consistency, and relationship awareness.
- Pending extractions do not automatically make the persona “more accurate”; confirmation still matters.
- The UI may show knowledge completeness / source counts as operational readiness, never as “92% the real person.”

### Accumulate, do not replace

| Event | Behavior |
| --- | --- |
| New file (new checksum) | Parsed, chunked, embedded, and extracted **in addition to** existing rows |
| Duplicate file (same SHA-256 for that persona) | Rejected or linked as duplicate; does not wipe prior data |
| New extraction overlapping an existing confirmed trait/memory | Attach new evidence or open a conflict for review — **do not** delete the old confirmed row |
| Reprocess **the same** file | New generation replaces derived artifacts **for that file only**; other files’ memories and chunks stay |
| Delete one source | Purge only that source’s derived data; the rest of the persona remains |
| Owner-entered biography / notes | Remain unless the owner edits or deletes them |

```text
Persona knowledge over time

  File A ──► chunks + memories + traits
  File B ──► chunks + memories + traits   (adds)
  File C ──► chunks + memories + traits   (adds)
       └── never replaces A or B unless the owner deletes that source
```

There is no full-corpus “retrain from scratch” that discards prior confirmed knowledge. Optional re-embedding for a model migration is additive/dual-read, then drop the old vectors — still not a product wipe of memories.

## Chat availability after create

```text
Create persona
  → appears in Chat picker / persona switcher immediately
  → status draft | collecting until consent + minimum knowledge
  → when ready (or while collecting with biography-only, see below): user can open a conversation
```

**Picker rule:** every persona the user can access (any membership, not deleted, not suspended) is listed under Chat.

**Send-message rule (MVP):**

- `suspended` or `deleting` → cannot send (`422 PERSONA_UNAVAILABLE`).
- Missing converse / provider consent → `422 CONSENT_REQUIRED`.
- `draft` / `collecting` with no confirmed memories and short biography → allow chat but the model is instructed that the record is limited (already in readiness design). Owner is nudged to upload and review.
- Participants only see personas they were invited to; those do not require the participant to own a plan slot.

There is **no** separate “publish to chat” toggle. Create = available in chat navigation.

## Enforcement points

| Checkpoint | Error |
| --- | --- |
| `POST /personas` when owned count ≥ plan max | `403 PLAN_LIMIT_PERSONAS` with `{ plan, maxOwnedPersonas, currentOwned }` |
| `POST .../messages` when daily send count ≥ plan max | `429 PLAN_LIMIT_CHAT_DAY` with `{ plan, maxChatMessagesPerDay, usedToday, resetsAt }` |
| Upgrade / downgrade | Update `subscriptions`; create and send checks use the new plan immediately |
| Admin override | Platform admin may set `subscriptions.override_max_personas` for support cases (null = use plan). Optional later: `override_max_chat_messages_per_day` |

All future limits (upload size, tokens, etc.) register in the same `PlanGuard` so UI can call `GET /me/plan` and disable buttons consistently.

## UI surfaces

| Surface | Behavior |
| --- | --- |
| Dashboard | Persona cards, create button (disabled with upgrade CTA when at cap), plan badge |
| Account → Plan | Current plan, owned count / max, chat memory window, daily send allowance, upgrade copy |
| Chat | Persona switcher: all accessible personas; empty state if none |
| Admin | View/change user plan; optional override; no persona content |

## Open decisions (yours later)

Documented so engineering does not invent them:

1. Exact feature matrix beyond persona count, chat memory, and daily sends (export, legacy, member seats, storage, tokens).
2. Payment provider and billing country.
3. Whether Pro+ is the top tier or more tiers follow.
4. Whether soft-deleted personas should free the slot immediately (current default: **no**).
5. Whether participants on many personas need a plan at all (current default: **no plan required to be invited**).
6. Confirm Pro **1,000** / Pro+ **10,000** chat-memory defaults (Free **100** is locked to your intent unless you change it).
7. Whether chat history UI still shows messages outside the model’s memory window (current default: **yes**).
8. Daily send day boundary: UTC (default) vs user time zone.
