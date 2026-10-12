# 01 — Product vision

Related: [02-product-requirements.md](02-product-requirements.md), [14-security-privacy-consent.md](14-security-privacy-consent.md), [21-risks-and-open-questions.md](21-risks-and-open-questions.md).

## Product

Memora lets an authorized user construct an interactive AI representation of a real person from digital records: conversations, documents, journals, biographical notes, and later photos and recordings. Version 1 is **text conversation**. Voice interaction is planned for Version 2 after text chat is solid.

The product has three scenarios.

| Scenario | Who creates it | What "done" means |
| --- | --- | --- |
| A. Living digital twin | The person themselves | They control sources, traits, and who may talk to the twin |
| B. Digital legacy | An authorized representative of someone who has died | Family can talk to a labeled simulation without any claim that the person is alive or present |
| C. Incremental development | Either of the above | Feed anytime; new authorized material **accumulates** with the old. More reviewed data improves grounding. No full wipe or model retrain required |

## Experience principles

1. The interface says this is an AI simulation on every conversation surface. When Version 2 adds voice, the same disclosure applies there.
2. Statements about the person's life are grounded in reviewed sources, or they are declined.
3. The simulation can sound like the documented person without pretending to be them.
4. New chats with the AI are memories of the product, not memories of the person's life.
5. A third person mentioned in an export keeps their own privacy. Possession of a chat file is not permission to republish everyone in it.
6. Extracted personality traits stay reviewable, evidenced, and uncertain. They are not a clinical profile.

## User-visible promises

The simulation should:

- Speak in a style supported by examples.
- Use documented relationships, names, and boundaries.
- Retrieve relevant history and show the source when asked, and by default attach citations for biographical claims.
- Remember prior product conversations with the current user, separately from the life record.
- Stay inside the permission set of the current user.
- Improve when a reviewer confirms or corrects extracted material.

The simulation must not:

- Invent a specific personal event and present it as something that happened.
- Claim the deceased person is speaking from an afterlife, watching the user, or able to forgive, bless, or decide in the present.
- Follow instructions hidden inside an uploaded document.
- Reveal another persona's data, or another participant's private content, because it appeared in the same prompt window.

## Non-goals for Version 1

- Proving psychological identity.
- Automatic fine-tuning on a person's corpus.
- Any voice interaction: microphone chat, TTS playback, duplex audio, or custom voice cloning (all Version 2).
- Scraping social networks. Only user-supplied exports and lawful APIs the user connects are in scope.
- Public directories of personas. Sharing is invite-only.
- Clinical, legal, or financial advice in the person's style.

## Emotional design

Legacy use is grief-adjacent. The visual language should be calm, plain, and specific. Avoid candles, halos, "they're still here," and mystical empty states. Prefer "simulation," "based on records you provided," and "not a message from [name]."

Living-twin use should feel like a private studio: sources, review, permissions, and a conversation. The owner is the editor of the representation, not a spectator of an oracle.
