# 02 — Product requirements

Related: [03-feature-specification.md](03-feature-specification.md), [14-security-privacy-consent.md](14-security-privacy-consent.md), [18-development-roadmap.md](18-development-roadmap.md).

Requirements use MoSCoW. MVP means Phases 1–3.

## Actors

| Actor | Description |
| --- | --- |
| Platform administrator | Operates users, jobs, providers, and abuse queues. No default content access |
| Persona owner | Living subject, or the account that holds a legacy persona after authorization review |
| Persona manager | Delegated operator who can edit sources and review extractions |
| Approved contributor | Can upload sources and propose corrections |
| Approved participant | Can converse within a permission profile |
| Trusted contact | Designated person who can request suspension or legacy transfer |
| Untrusted upload | File and text content. Never treated as instructions |

## Functional requirements

### Identity and access

| ID | Requirement | Priority |
| --- | --- | --- |
| AUTH-1 | Email registration, verification, login, logout, password reset | MVP |
| AUTH-2 | Session list and remote revocation | MVP |
| AUTH-3 | TOTP multi-factor authentication, encouraged and enforceable per persona | MVP |
| AUTH-4 | Optional OAuth (Google first) | Later |
| AUTH-5 | Account deletion that queues erasure of owned personas or transfers them | MVP |
| AUTH-6 | Platform roles separate from persona roles | MVP |
| AUTH-7 | Audit log for auth, permission, consent, deletion, and admin actions | MVP |

### Personas

| ID | Requirement | Priority |
| --- | --- | --- |
| PER-1 | Create a persona with name, languages, biography, and scenario (living or legacy) | MVP |
| PER-2 | Living persona requires the creator to attest they are the subject | MVP |
| PER-3 | Legacy persona stays non-conversational until authorization is approved | Later, schema in MVP |
| PER-4 | Profile photo, timeline, interests, and style notes | MVP for manual fields; AI extraction later in MVP |
| PER-5 | Knowledge completeness is a computed status, not a vanity score of identity | MVP |
| PER-6 | Version history for profile and personality card | Phase 4 |

### Ingestion

| ID | Requirement | Priority |
| --- | --- | --- |
| ING-1 | Upload TXT, MD, CSV, JSON, DOCX, PDF | MVP |
| ING-2 | WhatsApp `.txt` export | MVP |
| ING-3 | Telegram JSON, email (`.eml`), generic SMS CSV | Phase 2 stretch / Phase 4 if MVP slips |
| ING-4 | JPEG, PNG, WebP stored with metadata; understanding later | Store and caption in Phase 5; reject with a clear message before that |
| ING-5 | MP3, WAV, M4A, MP4 stored; transcription for knowledge or chat | Version 2; reject with `UNSUPPORTED_MEDIA` in Version 1 |
| ING-6 | Malware scan, type check, size limit, checksum dedupe | MVP |
| ING-7 | Source registry from file to chunk to memory | MVP |
| ING-8 | Reprocess a file without duplicating approved memories blindly | MVP |
| ING-9 | Messenger, SMS vendor apps, and call-recording imports only from user-held exports | Phase 4–5 |

### Intelligence

| ID | Requirement | Priority |
| --- | --- | --- |
| AI-1 | Async pipeline with progress, retries, and dead letters | MVP |
| AI-2 | Personality signals with evidence and uncertainty, held for review | MVP |
| AI-3 | Biographical memories separate from conversational memories | MVP |
| AI-4 | Hybrid retrieval scoped by persona and permission | MVP |
| AI-5 | Streaming text chat with citations | MVP (primary product surface) |
| AI-6 | Relationship-conditioned style after owner approval of the relationship | Phase 4 |
| AI-7 | Contradiction queue | Phase 4 |
| AI-8 | Image captions and photo search | Phase 5 |
| AI-9 | Speech in, speech out, then duplex voice | Version 2 |
| AI-10 | Custom synthetic voice only after a verified consent workflow | Version 2, gated |

### Governance

| ID | Requirement | Priority |
| --- | --- | --- |
| GOV-1 | Purpose-specific consent before processing and before any external model call | MVP |
| GOV-2 | Third-party participant content excluded from answers by default | MVP |
| GOV-3 | Export of the owner's data | Phase 4, schema reserved |
| GOV-4 | Revoke a source and delete derived artifacts | MVP |
| GOV-5 | Simulation disclosure that cannot be turned off by the owner | MVP |
| GOV-6 | Abuse report and persona suspension | Phase 6 for full queue; a manual flag in MVP |
| GOV-7 | Ownership dispute freezes conversation and edits | Phase 6 |

## Non-functional requirements

| ID | Target |
| --- | --- |
| NFR-1 | Chat time to first token under 2.5 seconds at p95 for a warm short-context call, excluding cold provider incidents |
| NFR-2 | Upload acknowledgment under 1 second after bytes are stored; parsing is asynchronous |
| NFR-3 | Authorization failures return 403 and write an audit event |
| NFR-4 | A retrieval test fixture proves persona A chunks never appear for persona B |
| NFR-5 | Deleting a source removes its chunks and embeddings before the job is marked complete |
| NFR-6 | Secrets are not stored in the database or the repository |
| NFR-7 | Backups: daily database dump, object-storage versioning or replicated bucket, tested restore in Phase 6 |
| NFR-8 | WCAG 2.2 AA for primary flows: auth, upload, review, chat |
| NFR-9 | API errors use a stable code and a request id |

## Consent and authorization policies

These are product rules. Counsel must map them to statute before launch. See [14-security-privacy-consent.md](14-security-privacy-consent.md).

1. The subject of a living persona must have an account-level attestation, and processing consent that names the model provider.
2. A legacy persona requires a stated basis (executor, next of kin, or written authorization). Conversation stays disabled until a reviewer with the owner role confirms the record. Memora staff do not approve family relationships in the MVP; the product records the attestation and can suspend on dispute.
3. Other people in chats are participants, not content. Default retrieval uses the subject's own utterances for style, and uses third-party text only when the owner marks a lawful basis or the text is reduced to a redacted summary the owner approves.
4. Sensitive categories (health, religion, political opinion, biometric voiceprint, children's data) are detected, labeled, and omitted from retrieval unless the owner explicitly includes them for a named audience.
5. Children are out of scope as persona subjects for the MVP. Do not create a persona whose subject is described as under 18.
6. Consent withdrawal stops new processing and new external calls, and starts deletion of derived data for the withdrawn purpose.

## Out of scope for Version 1

Public personas, marketplace, mobile native apps, SMS gateways, automated scraping, multi-agent swarms, on-prem GPU inference, and all voice interaction (STT, TTS, duplex, cloning). Voice is Version 2.
