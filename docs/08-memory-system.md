# 08 — Memory system

Related: [07-personality-engine.md](07-personality-engine.md), [09-rag-pipeline.md](09-rag-pipeline.md), [11-database-design.md](11-database-design.md), [diagrams/05-memory-separation.md](diagrams/05-memory-separation.md).

## The separation rule

Memora stores two domains that must never be merged.

| Domain | What it is | Written by | Readable as the person's past? |
| --- | --- | --- | --- |
| `biographical` | Events, preferences, and relationships supported by sources or owner entry | Ingestion and owner edits | Yes, when confirmed and permitted |
| `conversational` | What the current user and the simulation said inside Memora | Chat post-processing | No |

A conversational memory can say "On 8 October 2026, the user told the simulation about an exam." It cannot say "The person attended the exam." The prompt template names the domain in front of every memory line.

Implementation enforcement, all required:

1. Column `memories.domain` is `NOT NULL` and checked.
2. `biographical` rows require either a source evidence link or `origin = owner_entered`.
3. `conversational` rows require `conversation_session_id` and must not have source-file evidence.
4. Retrieval methods are separate: `searchBiographical` and `searchConversational`. There is no `searchAllMemories` in the chat service.
5. A database trigger rejects a biographical insert from the conversation module's database role if separate roles are used. At minimum, a repository test covers the ban.
6. The answer post-check may cite conversational ids only as "in your earlier chat," never as life events.

## Memory types inside the biographical domain

| Type | Question it answers | Example |
| --- | --- | --- |
| Semantic | What was generally true | Liked cricket |
| Episodic | What happened, with time and participants | Watched a match with Karim in 2019 |
| Autobiographical | First-person life narrative the subject told | A journal paragraph about leaving home |
| Relationship | How they addressed or treated someone | Called his daughter "Mitu" |
| Temporal | When a fact started or stopped | Lived in Chattogram until 2004 |

These are values of `memory_type`, not extra tables. Relationship-specific rows also carry `relationship_id`.

Conversational memory types are only `session_fact` (something the user told the simulation) and `session_preference` (how they want to be addressed). They are not episodic life events.

## Record shape

| Field | Notes |
| --- | --- |
| `id`, `persona_id`, `domain`, `memory_type` | Identity and partition |
| `text` | One or two sentences, canonical |
| `time_start`, `time_end`, `time_precision` | `day`, `month`, `year`, `approximate`, `unknown` |
| `status` | pending_review, confirmed, rejected, superseded, conflict |
| `knowledge_class` | A–E, same scale as traits |
| `confidence` | Model or reviewer |
| `audience` | any, family, friend, colleague, private |
| `origin` | extracted, owner_entered, conversation |
| `sensitivity` | none, health, belief, minor, financial, other |
| `embedding_id` | Optional semantic index for confirmed biographical rows |
| `supersedes_id` | Chain when a fact is corrected |

Evidence: `memory_evidence(memory_id, chunk_id or message_id, quote, created_by)`.

## Extraction

From chats: the worker groups the subject's messages with a window of two turns of context so the addressee is known, but the stored quote is the subject's wording unless the owner approves a broader quote.

From journals: one candidate per paragraph that contains a dated event or a stable preference.

The model returns:

- `text`
- `type`
- `time` fields
- `participants` as strings to link later
- `quote` that must occur in the source span
- `sensitivity` guess
- `confidence`

Candidates that fail the quote check are discarded. Candidates with sensitivity other than `none` default to audience `private` and `pending_review`.

Owner-entered memories skip the model and start as `confirmed`, class D, origin `owner_entered`.

## Consolidation

Nightly, or at the end of an import:

- Exact normalized duplicates merge evidence onto the older confirmed row.
- Near duplicates (embedding cosine above 0.92 and same type) are queued for review, not auto-merged in the MVP.
- A new candidate that negates a confirmed memory ("never liked cricket" versus "liked cricket") creates `memory_conflicts` and sets the new row to `conflict`.

Phase 4 adds a reviewer UI. The MVP stores the conflict and hides both the new row and, if the contradiction is explicit, flags the old row with `has_conflict = true` without hiding it. The prompt is told that a flagged memory is disputed and should be described as disputed.

## Corrections and retraction

- Edit: write a new version, `supersedes_id` points at the old row, old status becomes `superseded`. Superseded rows are not retrieved.
- Reject: status `rejected`, kept for audit, not retrieved.
- Source revocation: delete evidence from that source; if no evidence remains and origin is `extracted`, status becomes `retracted` and the row leaves retrieval. Owner-entered text remains.
- Conversation deletion: delete conversational memories for that session.

## Retrieval

Biographical search filters:

- `persona_id`
- `domain = biographical`
- `status = confirmed`
- audience allowed for this membership
- sensitivity allowed for this membership
- optional time overlap
- optional relationship id

Conversational search adds `conversation_session.user_id = actor` or a shared-session rule. One user's chats are not visible to another participant. Owners do not read other people's conversation memories in the MVP. That default protects the visitor. It can be revisited only with a clear product decision.

## Permissions

Audience `private` is owner and manager only. `family` requires membership audience family or a broader grant. The owner sets the participant's audience tag. The participant cannot raise it.

## Temporal validity

Facts with `time_end` in the past are retrieved with the range attached. The prompt says not to describe them as current. Example: a job that ended in 2011 is "worked as," not "works as."

## Deletion

Hard-delete embeddings and evidence quotes on revocation. Tombstone the memory row (`status=retracted`, `text` cleared) so conflict links still resolve. See [11-database-design.md](11-database-design.md).
