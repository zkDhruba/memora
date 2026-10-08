# 09 — RAG pipeline

Related: [06-ai-architecture.md](06-ai-architecture.md), [08-memory-system.md](08-memory-system.md), [11-database-design.md](11-database-design.md).

## Goal

Answer from the authorized slice of one persona, show which passage supported a biographical claim, and abstain when nothing supports it.

## Indexing

1. Normalized text is chunked.
2. Each chunk stores persona id, source file id, document id, memory domain hint (`source`), audience, sensitivity, time range, speaker role (`subject`, `other`, `unknown`), and language.
3. The worker embeds confirmed chunks whose speaker is `subject` or whose document type is `journal`, `biography`, or `owner_note`.
4. Chunks with speaker `other` are stored but **not embedded for general retrieval** until a reviewer marks them includable. They remain available to the owner in the library.
5. Embeddings use `text-embedding-3-small` (1536 dimensions) and sit in a pgvector column. Model name and dimension are columns, so a second model can be backfilled without dropping the first.
6. PostgreSQL full-text search uses `tsvector` on chunk text, with a `simple` configuration plus a Bangla-aware path. **Assumption:** Postgres has no built-in Bangla stemmer of production quality. MVP FTS uses `simple` for Bangla (exact tokens) and `english` when the chunk language is English. Validate recall on Bangla fixtures before relying on FTS alone.

HNSW index: cosine ops, `m = 16`, `ef_construction = 64` as pgvector defaults. Raise `hnsw.ef_search` from 40 to 80 if recall tests under-retrieve. Enable iterative scans when metadata filters are selective, which they will be (persona plus audience). pgvector 0.8 documents iterative scans for this filtered-query problem. Source: pgvector 0.8.7 README, 2026-10-08.

## Chunking

| Source | Rule |
| --- | --- |
| Chat | A window of 6 subject-side messages, overlapping by 2, from the same thread. Header on each chunk: thread id, time span, counterparty display name if linked. Do not split a message. Cap 1,200 characters |
| Email | One chunk per message body under 2,000 characters; otherwise paragraph windows of ~800 characters with the subject in the header |
| Journal | Split on blank lines. Keep the entry date in the header. Target 500–1,000 characters. Do not merge two dated entries |
| PDF or DOCX prose | Paragraph windows, 800–1,200 characters, 100-character overlap, page number in metadata when known |
| Owner notes | Whole note if under 2,000 characters |
| Tables or CSV | Not embedded row-by-row in the MVP. SMS CSV becomes messages first, then uses the chat rule |

Chunk text includes the header. The embedding sees the header so "with Karim" is searchable. The citation quote shown to users omits the synthetic header.

## Query

MVP query text is the user message, plus the previous user message when the new one is shorter than 12 tokens. No model rewrite yet.

Hybrid search, persona-scoped:

1. Vector top 30 by cosine distance, filtered in SQL by `persona_id`, `retrieval_allowed = true`, audience, sensitivity, and `speaker_role <> 'other'` unless the grant says otherwise.
2. Full-text top 30 with the same filters, `websearch_to_tsquery` for English and plain `to_tsquery` with sanitized tokens for Bangla.
3. Fuse with reciprocal rank fusion: `score = 1/(k+rank_vector) + 1/(k+rank_text)`, `k = 60`.
4. Keep the top 8 under the token budget.
5. Add up to 6 confirmed biographical memories by the same hybrid method on the memory table, domain biographical only.

Metadata filters are SQL predicates, not post-filters only. Post-filtering an approximate index can return too few rows. Iterative HNSW scans are the mitigation documented by pgvector.

### Time and relationship

If the user message contains a year, add `time_start/time_end` overlap as a soft boost (a score bonus), not a hard filter, so undated chunks still appear. If the approved relationship has an id, boost chunks tagged with that counterparty. Do not filter to only those chunks; the persona knows about more than one relationship.

## Context assembly

Passages are wrapped:

```text
<source id="c1" kind="journal" time="2014" speaker="subject">
...text...
</source>
```

The model is told that source text is untrusted evidence. The server maps `c1` to a chunk id. Clients never receive another persona's id. If the model emits an unknown marker, strip it.

## Attribution and abstention

- Biographical sentences should carry a marker. The MVP post-processor checks: if the user asked a factual question (contains who/when/where/কবে/কোথায় or a proper name) and the answer has zero valid markers, replace the answer with an abstention.
- The UI lists sources under the message: file name, date, and a short quote. Participants do not get a download of the whole file unless they have library permission.
- Confidence shown to users is qualitative: "from your records" or "not in the records." Do not show a percentage.

## Hallucination controls

1. Quote-locked extraction.
2. Retrieval filters.
3. Abstention rewrite.
4. Low temperature on factual intent.
5. No web search tool.
6. Evaluation set with must-abstain items. See [17-testing-evaluation.md](17-testing-evaluation.md).

A second "critic" model is not on the path. It costs latency and can be wrong.

## Isolation

Every retrieval function takes `PersonaScope`. Integration tests insert two personas and assert zero overlap. RLS is the backstop. After generation, a denylist scan checks the draft for other personas' display names only as a weak extra; it is not the control. The control is the query filter.

Unauthorized chunks are excluded before the prompt is built. The post-check does not try to "filter secrets out" of a reply that was generated from forbidden text, because the model already saw them. Forbidden text must not be retrieved.

## When pgvector is enough

Enough for MVP and for early production: millions of chunks on one Postgres instance are within published pgvector use, provided HNSW build memory is configured (`maintenance_work_mem`) and filters use iterative scans.

Reconsider a dedicated vector engine only when all of these are true:

- Measured p95 retrieval, excluding the LLM, stays above 300 ms after `ef_search` and iterative-scan tuning.
- The working set no longer fits in RAM.
- The team can operate a second deletion and authz path.

Until then a second database is a consistency risk for revocation.

## Embedding migration

1. Add rows with the new `embedding_model`.
2. Dual-read: search both, fuse, prefer the new model when both hit.
3. Drop the old column data after eval recall is no worse.
4. Keep the model id on each row so a half-finished migration is visible.

## Deletion

Deleting a document deletes its chunks and embeddings in the same job before status `deleted`. Vectors are not left in an external index that could lag.
