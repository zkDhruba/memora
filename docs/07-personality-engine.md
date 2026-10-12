# 07 — Personality engine

Related: [06-ai-architecture.md](06-ai-architecture.md), [08-memory-system.md](08-memory-system.md), [17-testing-evaluation.md](17-testing-evaluation.md).

## Position

The personality layer is a **versioned, evidence-backed style card** plus a small set of approved excerpts. It is not a psychological diagnosis, not a hidden embedding of "the self," and not a fine-tune.

Fine-tuning is rejected for the MVP. OpenAI's pricing page, retrieved 8 October 2026, says the fine-tuning platform is winding down for new users. Even if a vendor still offers it, a fine-tune is hard to delete when a source is revoked, hard to cite, and easy to over-claim. Prompting, retrieval, and excerpts are revocable: delete the rows and the next request changes.

## Five knowledge classes

| Class | Meaning | Chat use | Example |
| --- | --- | --- | --- |
| A. Verified biographical fact | Reviewer confirmed, with a source quote | Retrievable as fact | "Taught at Dhaka University from 1998" |
| B. Observed communication pattern | Measured or quoted from the subject's own messages | Style only | Short replies before noon; uses "আচ্ছা" |
| C. Inferred trait | Model interpretation | Only after confirmation, and phrased as tendency | "Often teases close friends" |
| D. User-supplied description | The owner wrote it | Used, labeled as supplied | "I want the twin to be more patient than I am in email" |
| E. Uncertain or conflicting | Low confidence or contradiction | Not retrievable | Two years of birth in different documents |

Class C never starts as confirmed. Class D is visible in the editor as the owner's instruction, so it is not mistaken for history.

## Representation

One active `personality_profiles` row per persona, plus historical versions.

```json
{
  "version": 4,
  "languages": ["bn", "en"],
  "formality": {
    "default": "informal",
    "byAudience": { "colleague": "mixed" },
    "evidenceIds": ["ev_12"]
  },
  "sentenceLength": { "typical": "short", "evidenceIds": ["ev_3"] },
  "lexicon": {
    "preferred": ["আচ্ছা", "ধুর"],
    "avoid": ["dear sir"],
    "evidenceIds": ["ev_9"]
  },
  "greetings": ["কি অবস্থা?"],
  "farewells": ["যাই"],
  "humor": { "note": "dry, brief", "class": "C", "status": "confirmed" },
  "emotionalExpressiveness": { "note": "understated", "class": "C" },
  "languageSwitching": { "note": "Bangla with family, English for work terms", "class": "B" },
  "storytelling": { "note": "anecdote then a one-line moral", "class": "C" },
  "boundaries": ["Do not invent opinions about relatives who are still alive"],
  "excerpts": [
    { "text": "…", "sourceMessageId": "…", "audience": "family" }
  ]
}
```

The database stores traits in tables so they can be reviewed one by one. The JSON above is the compiled card cached for prompts, rebuilt when a trait changes.

### Trait record

| Field | Role |
| --- | --- |
| `id` | Stable id |
| `persona_id` | Scope |
| `facet` | Closed vocabulary: formality, sentence_length, lexicon, greeting, farewell, humor, emotion, habit, interest_expression, storytelling, code_switching, address_term |
| `value` | Short text |
| `knowledge_class` | A–E |
| `status` | pending_review, confirmed, rejected, superseded |
| `confidence` | 0–1, model-reported, not shown as science |
| `audience` | any, family, friend, colleague, private |
| `polarity` | observed, owner_requested |
| `profile_version` | Which compiled card included it |

Evidence rows point at a message, chunk, or manual note, with a quote no longer than 280 characters and a character offset when available.

## Extraction

Deterministic measurements run before any model call, on the subject's own turns:

- Median message length in characters.
- Question-mark rate.
- Emoji rate.
- Language mix by script (Bengali Unicode block versus Latin).
- Top repeated phrases of 2–5 words, with a minimum count, excluding names and numbers.
- Greeting and farewell candidates from the first and last line of threads.

These are class B. They do not need a model. Store the statistic and three example message ids.

Then Haiku reads a stratified sample, not the whole corpus:

- Up to 40 of the subject's messages, spread across years and counterparties.
- The owner's manual notes.
- Output: candidate traits class C, each with a supporting quote that must be a substring of the input. The worker drops candidates whose quote is not found. That check is the main anti-hallucination control at extraction time.

Relationship-dependent language is a facet tied to a counterparty id, produced only when that counterparty is already a linked participant.

## How the card is used

The chat prompt receives the compiled card and excerpts. It does not receive the statistics tables. Retrieval still supplies topical content. Style and facts stay on different paths so a witty tone cannot smuggle in a fake event.

Owner-requested traits (class D) are prefixed in the prompt as "instructions from the person who configured this simulation," so the model does not narrate them as past behavior.

## Updates (additive)

Feeding is continuous. A new file never resets the personality card to empty.

1. New file processed (may be months after the first import).
2. New candidates are inserted as `pending_review` and linked to the file generation.
3. If a candidate matches an existing confirmed trait (same facet, high string similarity, same audience), attach the new evidence and do not create a second trait.
4. If it contradicts a confirmed trait, open a conflict and leave the old trait active.
5. Reviewer confirms or rejects.
6. Worker recompiles the card, bumps `profile_version`, and stores the previous JSON on `personality_profile_versions`.

Deleting a source deletes evidence rows from that source. A trait with no remaining evidence returns to `pending_review` and drops out of the compiled card until reconfirmed. Other sources’ traits stay.

## What this will not do

- Score "Big Five" for display. Those labels invite false precision. Internal experiments may use them; the product copy must not.
- Claim that a style similarity number is the person. Evaluation reports live with engineers. See [17-testing-evaluation.md](17-testing-evaluation.md).
- Let the model invent mannerisms to fill an empty corpus. If fewer than 30 subject messages exist, the card says style evidence is limited and the prompt tells the model to stay plain.

## Optional later methods

- A learned classifier over features for facet prediction, only if the LLM extractor is unstable across reruns.
- Few-shot excerpts remain the main style method even then.
- Fine-tuning only if, after Phase 4 evals, style similarity stays below the agreed qualitative bar and deletion can be handled by not training on revocable data. That bar is a product decision, not a default.
