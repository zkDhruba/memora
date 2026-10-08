# 21 — Risks and open questions

Related: [14-security-privacy-consent.md](14-security-privacy-consent.md), [16-cost-and-scaling.md](16-cost-and-scaling.md).

## Assumptions used so planning could finish

| ID | Assumption | If wrong |
| --- | --- | --- |
| A0 | Version 1 is text conversation only; voice is Version 2 | Reopen Module J only when the product owner starts Version 2 |
| A1 | The first users are adults creating twins of themselves | Legacy UI moves earlier and needs counsel before any chat |
| A2 | Sending text to Anthropic or OpenAI can be made lawful with notice and a processor contract | Block the provider and spike a local model before Phase 3 |
| A3 | English and Bangla are the launch languages | Add the real language to the gold set before calling chat done |
| A4 | One owner per persona is enough | Add transfer before account deletion ships to the public |
| A5 | Families will accept abstention more than invention | Revisit copy, not the abstention rule |
| A6 | `@nestjs/bullmq` may lag Nest 12 | Direct BullMQ is already the plan |
| A7 | Tailwind 4 is what `create-next-app` emits | Accept the scaffolded major |
| A8 | `text-embedding-3-small` at $0.02 / million tokens is the billable rate | Reconfirm; the model page layout mentioned batch pricing beside the figure |
| A9 | Postgres `simple` FTS is good enough alongside vectors for Bangla | Add a Bangla tokenizer only if recall fails |
| A10 | Hetzner or a similar EU VM is an acceptable host | Use a region counsel approves |

## Open questions for the product owner

1. Is Memora the public name?
2. Which provider should be the default in the consent screen, Anthropic or OpenAI?
3. Should managers see visitors' conversational memories? The plan says no.
4. What is the default daily token quota per persona?
5. Is legacy (Scenario B) a launch feature or a later one? The plan builds the columns early and the workflow in Phase 4.
6. Will you verify identity, or accept self-attestation for the MVP?
7. Are paid plans required in the first year, or is this a private deployment?
8. Who is the data fiduciary: a company, or an individual operator?
9. When should Version 2 voice open? Default: after Version 1 text chat is in real use (assumed after Phase 6).

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Chat tokens dominate cost | Product becomes too expensive at a few hundred active users | Quotas, short prompts, cheaper small-talk model, measure in week one |
| Cross-border transfer is restricted | Phase 3 cannot launch on hosted APIs | Legal check before any real corpus is sent. Spike local inference only after that |
| Third-party chat privacy | Harm to people who never signed up | Do not embed their text. Owner library only |
| Grief and deception | Users treat the simulation as the person | Non-dismissible disclosure, banned afterlife phrases, calm UI |
| Hallucinated memories | False biography | Quote check, citations, abstention, human review |
| Prompt injection in journals | Data leak or policy bypass | No tools, source wrapping, sentinel tests |
| Weak legacy authorization | A relative builds a persona they should not | Draft status, dispute freeze, no staff browsing |
| Voice cloning misuse | Impersonation fraud | Entire voice surface is Version 2. When opened: off by default, living-subject consent only, no legacy cloning without a separate design |
| Fine-tune or long context as a shortcut | Cannot delete or cite | Rejected in [20-technical-decisions.md](20-technical-decisions.md) |
| pgvector recall with filters | Missing evidence | Iterative scans, recall eval, raise `ef_search` |
| Bangla quality | Style and retrieval fail the actual users | Gold set in Bangla before multilingual is marked done |
| Single-server operations | Data loss | Encrypted backups and one restore drill before real users |
| Nest 12 package lag | Lost time at scaffold | Pin versions from npm the day you start; the decision log allows Nest 11 only if a required official package cannot run |
| Emotional attachment to scores | False claim of identity | Do not show psychometric percentages |

## Proof-of-concept experiments

Run these before or during Phase 3. They are spikes, not architecture changes.

| Experiment | Question | Pass |
| --- | --- | --- |
| E1. WhatsApp parser | Do the two common export formats from phones you control parse without a third-party SDK? | Fixtures from your own chats, then delete the raw files from the repo |
| E2. Bangla retrieval | On a 200-chunk synthetic journal, does hybrid search return the right paragraph for five Bangla questions? | At least 4 of 5 in the top 8 |
| E3. Abstention | Ten questions with no source. | Zero invented events |
| E4. Quote lock | Extractor returns quotes. | Invalid quotes are dropped and valid ones substring-match |
| E5. Provider cost | 20 real Sonnet turns with the budgeted prompt | Median input tokens recorded and compared with [16-cost-and-scaling.md](16-cost-and-scaling.md) |
| E6. Isolation | Two personas, sentinel strings | Zero leaks |
| E7. Haiku versus Sonnet for extraction | Same 30 messages | Human preference on JSON fidelity, not prose |

Do not run E1–E6 on another person's data.

## Decision log

Major choices are closed in [20-technical-decisions.md](20-technical-decisions.md). Reopen one only by adding a dated note there and updating the affected design doc in the same change.
