# 03 — Feature specification

Related: [07-personality-engine.md](07-personality-engine.md), [08-memory-system.md](08-memory-system.md), [10-ingestion-pipeline.md](10-ingestion-pipeline.md), [12-api-design.md](12-api-design.md), [13-frontend-architecture.md](13-frontend-architecture.md).

Priority labels: **MVP**, **P4**, **P5** (images in Version 1), **P6**, **V2** (voice — next product version).

## Module A — Authentication and user management

**MVP** unless noted.

- Register with email and password. Password hashed with Argon2id. Send a single-use verification link. Unverified users can sign in only to a verification screen.
- Login, logout, and logout-all-devices. Sessions are server-side rows, delivered as an HttpOnly, Secure, SameSite cookie.
- Password reset by emailed single-use token, 30-minute expiry, rotated on use.
- TOTP enrollment, recovery codes shown once, and step-up for export, deletion, permission changes, and provider consent.
- Profile: display name, locale, time zone. No public profile.
- Account settings: password, MFA, sessions, notification email.
- Platform role `admin` is assigned only by configuration or an existing admin. Everyone else is `member`.
- Persona authorization is separate. See roles below.
- Account deletion requires password and MFA if enabled, then queues erasure.
- Audit log is append-only from the application. Users can see their own security events. Admins see platform events, not message bodies.

**P4:** OAuth with Google. Link to an existing verified email only after the user confirms.

### Persona roles

Stored on `persona_memberships.role`. Permissions can be narrowed, not widened past the role, except `owner`.

| Capability | Owner | Manager | Contributor | Participant |
| --- | --- | --- | --- | --- |
| View persona card | Yes | Yes | Yes | Limited card |
| Converse | Yes | Yes | Optional | Yes |
| Upload sources | Yes | Yes | Yes | No |
| Review extractions | Yes | Yes | No | No |
| Edit personality card | Yes | Yes | No | No |
| Grant membership | Yes | No | No | No |
| Change privacy | Yes | No | No | No |
| Export | Yes | No | No | No |
| Delete persona or source | Yes | Delete own uploads only | Delete own uploads only | No |
| See third-party raw messages | Yes, if policy allows | Same as granted | No | No |

Participants also have an audience tag (`family`, `friend`, `colleague`, `private`) that filters memories and traits marked for a narrower audience.

## Module B — Digital persona creation

**MVP** wizard:

1. Scenario: living subject (only "this is me" in MVP) or legacy (saved as draft).
2. Names, languages, short biography written by the user.
3. Optional manual style notes and boundaries ("do not discuss health").
4. Consent: processing purpose, named provider, retention, and the simulation disclosure.
5. Persona is created in `draft` until consent is stored, then `collecting`.

Fields: id, display name, alternate names, profile object key, biography, languages, birth year (optional), death year (legacy only), communication notes, interests, readiness, privacy preset, created and updated timestamps. A voice-configuration field is reserved for Version 2 and is not shown in Version 1 UI.

AI-assisted extraction (**MVP**, after the first successful import) proposes traits and memories as `pending_review`. Nothing pending is eligible for chat retrieval.

Review actions: confirm, correct, reject, annotate. Confirmed items become retrievable. Corrected items store the reviewer's text as the canonical value and keep the model output in an audit field.

## Module C — Data ingestion

**MVP** formats: `.txt`, `.md`, `.csv`, `.json`, `.docx`, `.pdf`, and WhatsApp `_chat.txt` / exported `.txt`. ZIP is accepted only as a container for those types after inspection, with a file-count and uncompressed-size cap.

**P4:** Telegram `result.json`, `.eml` / `.mbox`, generic SMS CSV mapping, Facebook Messenger JSON export if the user supplies the download.

**P5:** images (JPEG, PNG, WebP) for captions and memory linking.

**V2:** audio and video source uploads (voice notes, call recordings). Video is demuxed to an audio track for transcription; frames are not understood in the first multimodal slice.

For each source the pipeline records the items in [10-ingestion-pipeline.md](10-ingestion-pipeline.md): format, parser, metadata, participants, threads, timestamps, attachments, validation, scan status, dedupe key, consent snapshot, errors, and reprocess generation.

## Module D — Processing pipeline

**MVP.** See [10-ingestion-pipeline.md](10-ingestion-pipeline.md) and [diagrams/04-ingestion-flow.md](diagrams/04-ingestion-flow.md).

Stages run as BullMQ jobs in the NestJS worker. A Python service is not required for MVP parsers.

Partial failure marks the file `needs_attention` and continues sibling files in the same import. Reprocess is explicit. Embedding model id is stored on every vector so a later model migration can backfill.

## Module E — Personality modeling

**MVP** structured card plus evidence. Details in [07-personality-engine.md](07-personality-engine.md).

The card is injected in compressed form. Raw corpus is not pasted into the system prompt.

## Module F — Memory

**MVP** hybrid store. Details in [08-memory-system.md](08-memory-system.md).

Hard rule: `memory_domain` is `biographical` or `conversational`. Conversational rows are invisible to biographical retrieval.

## Module G — RAG

**MVP** hybrid search. Details in [09-rag-pipeline.md](09-rag-pipeline.md).

## Module H — Conversation

**MVP:**

- SSE streaming.
- Persistent sessions, titles generated by a cheap model after the first exchange, editable by the user.
- Search over the user's own sessions.
- Delete session, which deletes conversational memories derived from it.
- Citation drawer.
- Thumbs and a short correction, which creates a review item, not a silent fact.
- Disclosure banner bound to the persona name.

**P4:** calibration mode that compares a sample reply with a real excerpt. Multilingual reply in the user's language when the persona's languages include it.

Context assembly is specified in [06-ai-architecture.md](06-ai-architecture.md). The full history is never sent.

## Module I — Relationship-aware behavior

**P4.** Graph of people, nicknames, and per-audience language. A participant's claim "I am the daughter" stays `unverified` until the owner approves it. Until then the model uses a neutral audience and the strictest privacy preset.

## Module J — Voice

**Held for Version 2.** Version 1 ships text conversation only. No microphone UI, no TTS player, no duplex socket, and no voice cloning in Version 1.

| Version 2 slice | Behavior |
| --- | --- |
| V2a | Record in the browser, upload, transcribe, reply in text, optional stock TTS playback of the reply |
| V2b | WebSocket audio stream, barge-in by stopping TTS, shared conversation session with text |
| V2c | Consented synthetic voice, off by default, watermarked disclosure in the player |

Custom voice requires a living subject in the session, a fresh consent, and a recorded consent phrase. Legacy voice cloning is disabled until counsel and the product owner explicitly enable a separate design. See [14-security-privacy-consent.md](14-security-privacy-consent.md) and [18-development-roadmap.md](18-development-roadmap.md).

## Module K — Images

**P5 (Version 1).** Store bytes and EXIF time. A vision call writes an observed description and a separate speculative column that is not retrievable until a human confirms it. No inference of health, ethnicity, religion, or identity beyond faces the owner has already named.

## Module L — Calibration and evaluation

**P4** harness, with a minimal citation and leakage test in the MVP. Metrics in [17-testing-evaluation.md](17-testing-evaluation.md). Scores are not shown to families as "percent [name]."

## Module M — Consent, privacy, security

**MVP** baseline, **P6** operational review queues. Specified in [14-security-privacy-consent.md](14-security-privacy-consent.md). This module is mandatory.

## Module N — Product UI

Screens are listed in [13-frontend-architecture.md](13-frontend-architecture.md). MVP screens: landing, auth, dashboard, create wizard, persona overview, upload, import status, review inbox, **text** chat, privacy, account. Image screens ship in Phase 5. Voice screens ship only in Version 2.

## Module O — Administration

**P6** for the full console. MVP includes health endpoints, job counts, and a break-glass content access path that is off, audited, and time-boxed if it is ever enabled. Admins manage users, suspensions, provider configuration, and cost. They do not browse memories.
