# Sequence diagrams

Participants are the browser, Next.js web app, NestJS API, worker, Postgres, object storage, and the allowlisted model provider.

## 1. Registration and login

```mermaid
sequenceDiagram
  actor User
  participant Web
  participant API
  participant DB
  participant Mail
  User->>Web: Register email and password
  Web->>API: POST /auth/register
  API->>DB: Insert user and verification token
  API->>Mail: Send verification link
  User->>Web: Open link
  Web->>API: POST /auth/verify-email
  API->>DB: Set email_verified_at
  User->>Web: Login and TOTP if enabled
  Web->>API: POST /auth/login
  API->>DB: Insert session
  API-->>Web: Set HttpOnly session cookie
```

## 2. Persona creation

```mermaid
sequenceDiagram
  actor Owner
  participant API
  participant DB
  Owner->>API: POST /personas with self attestation
  API->>DB: Insert persona status draft
  Owner->>API: POST consent for host and named provider
  API->>DB: Insert consents and audit
  API->>DB: Set status collecting
```

## 3. Authorization and consent

```mermaid
sequenceDiagram
  actor Owner
  participant API
  participant DB
  Owner->>API: Upload or chat request
  API->>DB: Load membership and active consent
  alt Consent missing
    API-->>Owner: 422 CONSENT_REQUIRED
  else Audience or role too low
    API-->>Owner: 403 or 404
  else Allowed
    API-->>Owner: Continue
  end
```

Legacy personas remain non-conversational until an authorization attestation exists. A dispute sets `suspended`.

## 4. Upload and validation

```mermaid
sequenceDiagram
  actor Owner
  participant API
  participant Store
  participant DB
  Owner->>API: POST presign
  API->>DB: Insert file status uploaded
  API-->>Owner: Presigned PUT
  Owner->>Store: PUT bytes to quarantine
  Owner->>API: POST complete
  API->>DB: Enqueue scan metadata
```

## 5. Parse

```mermaid
sequenceDiagram
  participant Worker
  participant Clam
  participant Store
  participant DB
  Worker->>Store: Read object
  Worker->>Clam: Scan
  alt Infected
    Worker->>Store: Delete object
    Worker->>DB: status infected
  else Clean
    Worker->>DB: Messages or document text
    Worker->>DB: Participants role other by default
  end
```

## 6. Personality extraction

```mermaid
sequenceDiagram
  participant Worker
  participant DB
  participant LLM
  Worker->>DB: Load subject messages sample
  Worker->>Worker: Compute length and phrase stats
  Worker->>LLM: Ask for traits with quotes
  LLM-->>Worker: JSON candidates
  Worker->>Worker: Drop quotes not in source
  Worker->>DB: Insert traits pending_review
```

## 7. Memory extraction

```mermaid
sequenceDiagram
  participant Worker
  participant LLM
  participant DB
  Worker->>LLM: Ask for biographical candidates
  LLM-->>Worker: Text quote time sensitivity
  Worker->>Worker: Verify quote and force domain biographical
  Worker->>DB: Insert memories pending_review
  Note over DB: No conversation_session_id on these rows
```

## 8. Embeddings

```mermaid
sequenceDiagram
  participant Worker
  participant DB
  participant Embed
  Worker->>DB: Select chunks where retrieval_allowed
  Worker->>Embed: Embed batch for this persona only
  Embed-->>Worker: Vectors
  Worker->>DB: Upsert chunk_embeddings and model id
```

## 9. Send a chat message

```mermaid
sequenceDiagram
  actor User
  participant API
  participant DB
  User->>API: POST message
  API->>DB: Authorize and insert user message
  API->>DB: Load cards and hybrid search
  API->>API: Budget prompt
  API-->>User: SSE tokens
  API->>DB: Save assistant message and citations
  API->>DB: Optional conversational memory
```

## 10. RAG and generation

```mermaid
sequenceDiagram
  participant API
  participant DB
  participant LLM
  API->>DB: Vector top 30 and FTS top 30 with persona filter
  API->>API: Reciprocal rank fusion and trim
  API->>LLM: Stable instructions plus sources
  LLM-->>API: Stream with citation markers
  API->>API: Map markers or abstain
```

## 11. Relationship-aware reply

```mermaid
sequenceDiagram
  actor User
  participant API
  participant DB
  User->>API: POST message
  API->>DB: Load relationship claim
  alt Claim approved
    API->>DB: Retrieve audience family memories
  else Pending or absent
    API->>API: Use neutral card and strictest audience
  end
```

Phase 4 behavior. The MVP uses the membership audience only.

## 12. Real-time voice (Version 2 — held)

Version 1 has no voice sequence. Text chat is sequence 9–11.

When Version 2 opens:

```mermaid
sequenceDiagram
  actor User
  participant API
  participant STT
  participant LLM
  participant TTS
  User->>API: WebSocket audio frames
  API->>STT: Stream audio
  STT-->>API: Transcript
  API->>LLM: Same chat path as text
  LLM-->>API: Reply text
  API->>TTS: Synthesize
  TTS-->>API: Audio
  API-->>User: Audio frames and disclosure event
```

Version 2a instead uploads a finished recording and returns text, then optional stock TTS. Custom cloned voice is not this diagram and stays gated.

## 13. Add material to an existing persona

```mermaid
sequenceDiagram
  participant Worker
  participant DB
  Worker->>DB: New file generation
  Worker->>DB: New pending traits and memories
  Worker->>DB: Attach evidence if trait already confirmed
  Worker->>DB: Open conflict if text contradicts
  Note over DB: Confirmed card stays until a reviewer decides
```

## 14. Correct a memory

```mermaid
sequenceDiagram
  actor Reviewer
  participant API
  participant DB
  Reviewer->>API: POST correct
  API->>DB: Insert new memory supersedes_id
  API->>DB: Old memory status superseded
  API->>DB: Recompile nothing stylistic unless traits changed
  Note over DB: Superseded rows are not retrieved
```

## 15. Revoke a source

```mermaid
sequenceDiagram
  actor Owner
  participant API
  participant Worker
  participant DB
  participant Store
  Owner->>API: DELETE file
  API->>DB: status deleting and cancel jobs
  Worker->>DB: Delete messages chunks embeddings evidence
  Worker->>DB: Retract extracted memories with no evidence left
  Worker->>Store: Delete objects
  Worker->>DB: status deleted and audit
  Note over DB: Owner-written biography remains
```
