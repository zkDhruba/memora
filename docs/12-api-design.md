# 12 — API design

Related: [03-feature-specification.md](03-feature-specification.md), [05-system-architecture.md](05-system-architecture.md), [13-frontend-architecture.md](13-frontend-architecture.md).

Base path `/api/v1`. JSON. Cookie session, `credentials: include`. Breaking changes bump the prefix. Additive fields do not.

OpenAPI is generated from Nest decorators and Zod schemas through the Nest 12 Standard Schema adapter. Swagger UI is on `/api/docs` in non-production only.

## Errors

```json
{
  "error": {
    "code": "PERSONA_FORBIDDEN",
    "message": "You do not have access to this persona.",
    "requestId": "01J...",
    "details": {}
  }
}
```

| HTTP | When |
| --- | --- |
| 400 | Validation |
| 401 | No session |
| 403 | Authenticated, not allowed |
| 404 | Missing, or hidden to avoid leaking existence across personas |
| 409 | Duplicate file, state conflict |
| 413 | Too large |
| 415 | Unsupported type |
| 422 | Schema valid but business rule failed, such as chat before consent |
| 429 | Rate limit |
| 503 | Dependency down |

Validation errors list `details.fields[{ path, code }]`.

## Pagination

Cursor pagination: `?limit=30&cursor=`. Response `{ data, nextCursor }`. Default limit 30, max 100.

## Auth

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | `{ email, password, displayName }` → `{ userId }` and email |
| POST | `/auth/verify-email` | Public | `{ token }` |
| POST | `/auth/login` | Public | `{ email, password, totp? }` → sets cookie |
| POST | `/auth/logout` | Session | Revokes current session |
| POST | `/auth/logout-all` | Session + recent MFA | Revokes all |
| POST | `/auth/password/forgot` | Public | Always 202, no email enumeration |
| POST | `/auth/password/reset` | Public | `{ token, password }` |
| POST | `/auth/mfa/setup` | Session | Returns otpauth URL once |
| POST | `/auth/mfa/confirm` | Session | `{ code }` |
| GET | `/auth/sessions` | Session | Device list |
| DELETE | `/auth/sessions/:id` | Session | Revoke one |

Login failure case: same message for unknown email and bad password. Lockout after 10 failures per email per hour, stored in Redis.

## Users

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/me` | Profile and platform role |
| PATCH | `/me` | `{ displayName, locale, timeZone }` |
| DELETE | `/me` | `{ password, totp }` queues erasure |

## Personas

| Method | Path | Authz | Body / result |
| --- | --- | --- | --- |
| GET | `/personas` | Session | Memberships |
| POST | `/personas` | Session | `{ scenario, displayName, languages, biography, attestation }` |
| GET | `/personas/:id` | Any member | Card appropriate to role |
| PATCH | `/personas/:id` | Owner, manager | Profile fields |
| DELETE | `/personas/:id` | Owner | Soft delete |
| POST | `/personas/:id/members` | Owner | `{ email, role, audience }` |
| PATCH | `/personas/:id/members/:userId` | Owner | Role or audience |
| DELETE | `/personas/:id/members/:userId` | Owner | Revoke |

Failure: legacy persona `POST` with `scenario=legacy` returns the persona in `draft` and `chat` disabled. Second owner is rejected (`409`).

## Consent

| Method | Path | Authz |
| --- | --- | --- |
| GET | `/personas/:id/consents` | Owner |
| POST | `/personas/:id/consents` | Owner |
| POST | `/personas/:id/consents/:consentId/revoke` | Owner |

`POST` body: `{ purpose, providerKey, statementVersion }`. Processing jobs check `send_to_provider` before any outbound call.

## Files and imports

| Method | Path | Authz | Notes |
| --- | --- | --- | --- |
| POST | `/personas/:id/imports` | Contributor+ | Creates import |
| POST | `/personas/:id/files/presign` | Contributor+ | `{ filename, mediaType, byteSize }` → `{ url, fileId, headers }` |
| POST | `/personas/:id/files/:fileId/complete` | Contributor+ | Enqueues scan |
| GET | `/personas/:id/imports/:importId` | Contributor+ | Progress |
| GET | `/personas/:id/files` | Contributor+ | Library. Participants get 403 |
| POST | `/personas/:id/files/:fileId/reprocess` | Manager+ | New generation |
| DELETE | `/personas/:id/files/:fileId` | Owner, or uploader | Enqueues purge |
| POST | `/personas/:id/files/:fileId/subject-mapping` | Manager+ | `{ participantId }` |

Presign failure: unsupported MIME `415`, oversize `413`, missing consent `422 CONSENT_REQUIRED`.

## Review, traits, memories

| Method | Path | Authz |
| --- | --- | --- |
| GET | `/personas/:id/review-queue` | Manager+ |
| POST | `/personas/:id/traits/:traitId/decision` | Manager+ `{ action: confirm\|reject\|correct, value? }` |
| GET | `/personas/:id/memories` | Manager+ or participant filtered |
| POST | `/personas/:id/memories` | Manager+ owner-entered |
| POST | `/personas/:id/memories/:memoryId/decision` | Manager+ |
| POST | `/personas/:id/memories/:memoryId/correct` | Manager+ |

Participants listing memories receive only confirmed rows in their audience, without evidence quotes if their role is participant. Owners receive quotes.

## Chat

| Method | Path | Authz | Notes |
| --- | --- | --- | --- |
| GET | `/personas/:id/conversations` | Participant+ | Own sessions only |
| POST | `/personas/:id/conversations` | Participant+ | New session |
| GET | `/personas/:id/conversations/:sessionId` | Owner of session | Messages |
| DELETE | `/personas/:id/conversations/:sessionId` | Owner of session | Deletes conversational memories |
| POST | `/personas/:id/conversations/:sessionId/messages` | Owner of session | JSON body `{ text }`. Response is `text/event-stream` |
| POST | `/personas/:id/messages/:messageId/feedback` | Session owner | `{ rating, note? }` |

SSE events: `token`, `citation`, `done`, `error`. Heartbeat comment every 15 seconds. If the client disconnects, the server still finishes persistence when possible and stops spending output tokens by aborting the provider stream.

Failure: persona not ready `422 PERSONA_NOT_READY`; cap exceeded `429 QUOTA`; provider down `503`.

WebSocket is not used for text.

## Relationships (Phase 4)

`GET/POST /personas/:id/relationships`, `POST /relationships/:id/claims`, `POST /claims/:id/decision`.

## Voice (Phase 5)

`POST /personas/:id/conversations/:sessionId/audio` for batch. WebSocket `/api/v1/voice` for duplex, same cookie auth, after the text path is solid.

## Admin

Prefix `/admin`, platform role `admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/users` | Search by email |
| POST | `/admin/users/:id/disable` | Disable login |
| GET | `/admin/jobs` | Counts and dead letters, no payloads that contain text |
| POST | `/admin/jobs/:id/retry` | Retry |
| GET | `/admin/usage` | Token sums |
| POST | `/admin/personas/:id/suspend` | Status suspended |

No `/admin/personas/:id/memories`. Break-glass content access is not an endpoint in the MVP.

## Internal worker interfaces

Not HTTP. In-process services:

```text
IngestionService.run(stage, payload)
PersonalityExtractor.extract(fileVersionId): Promise<TraitDraft[]>
MemoryExtractor.extract(fileVersionId): Promise<MemoryDraft[]>
RetrievalService.searchBiographical(scope, query): Promise<Passage[]>
LlmPort.completeJson / stream
```

Email is a job `notify.email` with `{ template, toUserId, params }` and no persona body in the template.

## Rate limits

Redis fixed window: login 10/minute/IP, upload complete 30/hour/user, chat 30/hour/user default. Limits are configurable without a deploy.
