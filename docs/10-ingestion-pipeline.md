# 10 — Ingestion pipeline

Related: [03-feature-specification.md](03-feature-specification.md), [09-rag-pipeline.md](09-rag-pipeline.md), [14-security-privacy-consent.md](14-security-privacy-consent.md), [diagrams/04-ingestion-flow.md](diagrams/04-ingestion-flow.md).

## Flow

```text
Presign → PUT bytes → complete → scan → parse → normalize
  → participants and threads → extract → review hold
  → chunk → embed → readiness
```

All stages after `complete` are BullMQ jobs in the NestJS worker. Payloads are ids. Bytes stay in object storage.

| Stage | Runtime | MVP |
| --- | --- | --- |
| Validate metadata and size | API | Yes |
| Malware scan | Worker calls ClamAV | Yes |
| Parse text, DOCX, digital PDF, WhatsApp | Worker, Node | Yes |
| OCR, diarization, local ASR | Python, later | No |
| Extraction and embeddings | Worker calls allowlisted APIs | Yes |

## Job contract

```text
job name: ingestion.scan | ingestion.parse | ingestion.extract | ingestion.embed | ingestion.purge
payload: { personaId, fileVersionId, importId, generation, stage }
idempotency key: personaId:fileVersionId:stage:generation
attempts: 5
backoff: exponential, 10s base
removeOnComplete: age 7 days
dead letter: ingestion.dlq
```

A generation counter increments on reprocess. Old generation jobs no-op when they see a newer generation on the file.

Progress is a row on `processing_jobs` with `stage`, `percent`, and `error_code`. The UI polls `GET /imports/:id`.

## Limits (MVP defaults)

| Limit | Value |
| --- | --- |
| File size | 25 MB text and documents; 100 MB audio later |
| Uncompressed zip | 200 MB and 500 files |
| Pages parsed | 200 |
| Messages per chat file | 50,000 |
| Chunks embedded per file without extra confirmation | 2,000 |

## Source registry

`source_files` is the root. `documents` are parsed views. `source_messages` are utterances. `document_chunks` point at a document or a message range. `personality_evidence` and `memory_evidence` point at messages or chunks. Nothing semantic exists without a path back to a file version or an owner-entered note.

## Per-source specification

### Plain text, Markdown, owner paste

| Item | Plan |
| --- | --- |
| Formats | `.txt`, `.md` |
| Parser | UTF-8 with BOM strip. Reject binary |
| Metadata | Filename, upload time, optional document date from the first ISO date |
| Participants | Single implied subject |
| Threading | None |
| Timestamps | Upload time if no date; precision `unknown` |
| Attachments | None |
| Validation | Non-empty, max size |
| Scan | ClamAV |
| Dedupe | SHA-256 per persona. Duplicate returns the existing file |
| Consent | Persona processing consent must be active |
| Errors | Encoding failure → `needs_attention` |
| Reprocess | New generation, replace chunks from the previous generation |

### CSV

Treated as a table preview in the MVP, not auto-converted to SMS, unless the user picks a mapping (sender, body, timestamp). Unmapped CSV is stored and searchable as text dump only after the owner confirms.

### JSON

Generic JSON is pretty-printed to text and not walked for secrets. Telegram `result.json` is a dedicated parser in Phase 4: messages array, `from`, `date`, `text` which may be a string or an entity array. Ignore unknown media.

### DOCX

`mammoth` to Markdown. Styles are discarded. Embedded images stored as attachments in Phase 5; ignored in MVP with a count warning. Audio attachments wait for Version 2.

### PDF

Text extraction for digital PDFs. If extracted text is under 50 characters per page for more than half the pages, mark `needs_ocr` and stop. Do not send the PDF to a vision model automatically.

### Email `.eml` (Phase 4)

`postal-mime` or `mailparser`. Store From, To, Date, Subject, text body. Strip HTML scripts. Do not execute calendar invites. Attachments follow the file policy.

### WhatsApp export

User-held export only. There is no WhatsApp partner API in this plan.

| Item | Plan |
| --- | --- |
| Formats | `.txt`, often `_chat.txt`, optionally inside a zip of media |
| Parser | Line regex for the common patterns: bracketed dates `[DD/MM/YYYY, HH:MM:SS] Name: text` and the variant `DD/MM/YYYY, HH:MM - Name: text`. Encryption notices and "omitted" media lines become system events, not speech |
| Metadata | Chat title if present, exporter locale if the date format is detected |
| Participants | Distinct name strings. The owner maps one string to the subject. Others stay `other` |
| Threading | One thread per file |
| Timestamps | Parse with an explicit format the user confirms when detection is ambiguous. Store UTC plus the original offset if known. Date-only lines keep precision `minute` |
| Attachments | Filename references in angle brackets link to zip entries when the zip was uploaded. Missing media is a warning, not a failure |
| Validation | At least one parsed message or the file is `parse_failed` |
| Scan | Zip entries scanned individually. Reject executables and nested zips beyond depth 1 |
| Dedupe | File hash, and message dedupe on `(thread, sender, timestamp, body hash)` |
| Consent | Owner must confirm they have a basis to upload the export. Other participants default to non-retrievable |
| Errors | Store unparsed lines in `parse_anomalies` for review |
| Reprocess | Required after the owner changes the subject-name mapping |

### Telegram, Messenger, SMS, calls

Phase 4–5, same columns. Messenger JSON from the user's download, not from a scraped session. SMS via CSV or the XML/SMS Backup format the user possesses. Call recordings are audio files plus an optional sidecar transcript; the platform does not connect to a telephone network.

### Images, audio, video

- **Images:** accepted in Version 1 Phase 5 only. Until then the API returns `415` with `UNSUPPORTED_MEDIA`.
- **Audio and video:** Version 2 only (transcription-dependent). Version 1 always returns `415` with `UNSUPPORTED_MEDIA` so bytes are not stored "just in case."

## Participant identification

Names from exports are labels, not accounts. `source_participants` holds the raw label. The owner links a label to the subject or to a relationship contact. Unlinked labels stay `unknown`. The system does not guess that a Memora user is a participant because the display names match.

## Security of content

- Quarantine bucket prefix until scan is clean, then copy to the persona prefix.
- Content-Type from magic bytes, not the browser.
- No macro execution, no PDF JavaScript, no HTML rendering of uploads in the app. The library shows extracted text.
- Prompt-injection strings are ordinary text. Parsers do not strip them; the chat layer treats sources as untrusted. Stripping would destroy evidence.
- Zip bombs: compressed ratio limit and uncompressed cap.

## Readiness

A persona becomes `ready_for_chat` when consent is active, at least one confirmed item exists (a memory, a trait, or an owner biography over 200 characters), and no purge job is running. Thin personas can still chat; the prompt says the record is limited.

## Deletion propagation

`ingestion.purge` deletes object versions, messages, chunks, embeddings, and extracted evidence for that file generation, then retracts memories left without evidence. It does not delete owner-written biography.
