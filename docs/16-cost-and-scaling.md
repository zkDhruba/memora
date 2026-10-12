# 16 — Cost and scaling

Related: [04-technology-stack.md](04-technology-stack.md), [15-infrastructure-deployment.md](15-infrastructure-deployment.md).

Prices below were read on **8 October 2026**. They will move. Formulas are the durable part.

## Planning assumptions

These are assumptions, not measurements.

| Input | 100 users | 1,000 | 10,000 | 100,000 |
| --- | --- | --- | --- | --- |
| Personas per user | 1 | 1 | 1.2 | 1.2 |
| Uploaded original data per persona | 200 MB | 500 MB | 1 GB | 1 GB |
| Extracted text per persona | 2 million tokens embedded once | 5 million | 8 million | 8 million |
| Active conversational users per day | 20% | 15% | 10% | 8% |
| Conversations per active user per day | 4 | 4 | 3 | 3 |
| Input tokens per chat turn | 8,000 | 8,000 | 8,000 | 8,000 |
| Output tokens per turn | 400 | 400 | 400 | 400 |
| Turns per conversation | 8 | 8 | 6 | 6 |
| Voice minutes per active user per month | 0 in Version 1 | 0 | 0 until Version 2 | 0 until Version 2 |

Concurrent chat users are assumed at about 5% of daily active users during a peak hour. The bottleneck is provider latency, not Node.

Embedding volume is a one-time ingest plus 10% monthly growth.

## Formulas

```text
monthly chat input tokens
  = users * active_rate * days * conv_per_day * turns * input_tokens

monthly chat output tokens
  = users * active_rate * days * conv_per_day * turns * output_tokens

chat cost
  = input_millions * input_price + output_millions * output_price

embed cost
  = token_millions * embed_price
```

Use 30 days. Conversation model: Claude Sonnet 5.5 at $2 / $10 per million tokens. Extraction: Haiku 5.5 at $0.10 / $0.50 under 100k tokens. Embeddings: $0.02 per million tokens as the planning rate for `text-embedding-3-small`.

Prompt caching can cut repeated instruction tokens. The estimates below **ignore cache** so they are conservative. Sonnet 5.5 cache hits are $0.10 per million input tokens if the stable prefix is cached.

## Worked chat cost (base)

Arithmetic for the base row, Sonnet 5.5 at $2 / $10 per million tokens, 30 days:

```text
turns = users * active_share * 30 * conversations_per_day * turns_per_conversation
input_cost = turns * input_tokens / 1e6 * 2
output_cost = turns * 400 / 1e6 * 10
```

**100 users** (20% active, 4 conversations, 8 turns, 8,000 input tokens):

- Turns: 100 * 0.2 * 30 * 4 * 8 = **19,200**
- Input: 19,200 * 8,000 = 153.6 million * $2 = **$307**
- Output: 19,200 * 400 = 7.68 million * $10 = **$77**
- Chat total about **$384 / month**

A quieter shape, 10% active and 3,000 input tokens, same 4 conversations and 8 turns:

- Turns: 9,600
- Input: 28.8 million * $2 = $58
- Output: 3.84 million * $10 = $38
- About **$96 / month**

The 8,000-token figure is a ceiling. Measure real medians in week one. Quotas still belong in the MVP, because a few heavy personas can exceed the average.

### Low / base / high chat assumptions

| Shape | Active share | Input tokens | Turns per conversation |
| --- | --- | --- | --- |
| Low | Half of the table's active share | 3,000 | 6 |
| Base | Table as written | 8,000 | Table as written |
| High | 1.5× the table's active share | 12,000 | Table as written |

| Users | Low | Base | High |
| --- | --- | --- | --- |
| 100 | about $70 | about $384 | about $810 |
| 1,000 | about $540 | about $2,880 | about $6,000 |
| 10,000 | — | about $10,800 | — |
| 100,000 | — | about $86,000 | — |

Workings worth rechecking if assumptions change:

- 1,000 base: 15% active, 4 * 8 turns → 144,000 turns → input $2,304 + output $576.
- 10,000 base: 10% active, 3 conversations, 6 turns → 540,000 turns → input $8,640 + output $2,160.
- 100,000 base: 8% active, 3 conversations, 6 turns → 4,320,000 turns → input $69,120 + output $17,280.
- 100 high: 30% active, 12,000 input tokens, 8 turns → 28,800 turns → about $806.

If 10,000 users chatted as hard as the 1,000-user base (15% active, 4 conversations, 8 turns), the bill would be about **$29,000 / month**, not the $10,800 base. That sensitivity is why quotas ship in the MVP.

`gpt-6-luna` or Haiku 5.5 at $0.10 / $0.50 would drop the 100-user base chat from about $384 to about **$19** (153.6 million * $0.10 + 7.68 million * $0.50). Quality may be too plain for the flagship conversation. The compromise: Haiku or Luna for extraction always; Sonnet for chat; a visible brief mode that caps retrieval near 2,000 tokens.

## Other variable costs

| Item | Formula | 100-user base | Notes |
| --- | --- | --- | --- |
| First ingest embeddings | 100 personas * 2M tokens * $0.02 / 1M | **$4** | Negligible |
| Extraction | Assume 0.5M input + 0.05M output tokens per persona once, Haiku rates | about **$8** once | Quote-locked, sampled |
| Transcription | minutes * $0.003 | **$0 in Version 1** | Version 2: `gpt-4o-mini-transcribe` listed estimate |
| TTS | characters / 1e6 * $15 | **$0 in Version 1** | Version 2: a 500-character reply is about $0.0075 |
| Live voice | $0.017 / minute STT plus TTS | **$0 in Version 1** | Version 2 planning example: 20 minutes * 100 users * $0.017 = $34 STT only |

Realtime audio at `gpt-realtime-2.1-mini` ($10 / $20 per million audio tokens) is **not** converted to a monthly figure here because the token-per-minute rate was not on the pricing page. Version 1 cost models ignore speech. Do not launch duplex voice in Version 2 without a measured tokens-per-minute trial. The full `gpt-realtime-2.1` audio rate is $32 / $64 per million tokens.

## Hosting floors

Verified Hetzner Cloud monthly prices, Germany/Finland, excl. VAT, excl. IPv4, new orders from 15 June 2026:

| Plan | Price |
| --- | --- |
| CX23, 2 vCPU, 4 GB | €5.49 |
| CX33, 4 vCPU, 8 GB | €8.49 |
| CX43, 8 vCPU, 16 GB | €15.99 |

Source: Hetzner docs price adjustment, retrieved 8 October 2026.

| Stage | Shape | Infra order of magnitude | Dominant cost |
| --- | --- | --- | --- |
| Prototype | One CX23, Compose, dump backups, developer APIs | Under €20/month plus API | API keys during tests |
| Small MVP | CX33 or CX43, Postgres on the VM, external object storage, Langfuse Hobby | Tens of euros plus API | Chat tokens once friends use it |
| Early production | CX43 app, second small VM or managed Postgres, object storage, email provider | Low hundreds of euros | Still tokens |
| Growing SaaS | Split worker, managed Postgres with pgvector, managed Redis, log sink | High hundreds to low thousands of euros | Tokens, then support |

Email, domain, and malware signature updates are small beside tokens. Langfuse Hobby is free up to 50k units and 30 days of history (pricing page, 8 October 2026). Budget a paid tier when traces exceed that; the monthly fee was not copied here because the fetched page did not clearly show the Core subscription price.

Object storage: confirm the current Hetzner or AWS price in the console. At personal-scale corpora (100 users * 200 MB = 20 GB) storage is small next to chat. At 100,000 users * 1 GB = 100 TB, storage and backups become a real line and must be repriced from the vendor page.

## Self-hosted models

A single 24 GB GPU server can run a small open-weight chat model. It does not automatically beat Sonnet on Bangla style and abstention. Cost is the GPU host (often more than a CX43 per month, and scarce in 2026 RAM markets) plus engineering time. Break-even against the API is a spreadsheet to run after the eval set exists, not before. Embeddings are already cheap enough that self-hosting them saves little at MVP volume.

OpenAI's note that fine-tuning is winding down for new users removes "we'll train a small model on the corpus" as a cost strategy.

## Scaling bottlenecks

| Layer | 100 | 1,000 | 10,000 | 100,000 |
| --- | --- | --- | --- | --- |
| App CPU | One VM | One VM, two API processes | Two app VMs | Horizontal API, still simple |
| Worker | One process | One VM | Separate worker VM, concurrency capped by provider rate limits | Queue partitions by persona hash |
| Postgres | Tiny | 8–16 GB RAM comfortable | Watch HNSW build memory and autovacuum | Partition `document_chunks` by persona hash if one table is unwieldy; still not a new database |
| Vectors | Trivial | Trivial | Tune `ef_search` | Dedicated vector DB only after the SLO miss in [09-rag-pipeline.md](09-rag-pipeline.md) |
| LLM | Quota and bill | Bill | Bill and a cheaper default | Contracted volume or a reviewed local model |

## Service objectives

| SLO | Target |
| --- | --- |
| API availability excluding provider | 99.5% early production |
| Time to first token p95 | 2.5 s when the provider is healthy |
| Retrieval p95 | 300 ms |
| Upload accept | 1 s after the object PUT |
| Ingest a 10 MB chat | Under 15 minutes excluding review |
| Purge completion | Under 1 hour for a normal file |

## Quotas to ship in the MVP

Without quotas the base case is the product risk.

- Daily **sent text** caps by plan: Free **25**, Pro **100**, Pro+ **unlimited** (account-wide). See [22-membership-and-persona-lifecycle.md](22-membership-and-persona-lifecycle.md).
- Conversational memory windows by plan: Free 100 / Pro 1,000 / Pro+ 10,000 messages.
- Owned persona caps: Free 1 / Pro 5 / Pro+ 20.
- Embedding cap per import.
- Owner-visible usage / plan page.
- Alert when the project daily spend crosses a configured amount.
