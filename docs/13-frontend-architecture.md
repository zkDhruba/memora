# 13 — Frontend architecture

Related: [03-feature-specification.md](03-feature-specification.md), [12-api-design.md](12-api-design.md).

## Stack

Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui. The browser talks only to the Nest API. Next.js is not the system of record and does not hold provider keys.

## Route groups

```text
app/
  (public)/
    page.tsx                 Landing
    login/page.tsx
    register/page.tsx
    verify/page.tsx
    reset/page.tsx
  (app)/
    layout.tsx               Session gate
    dashboard/page.tsx
    personas/new/page.tsx
    personas/[id]/
      page.tsx               Overview
      library/page.tsx
      imports/[importId]/page.tsx
      review/page.tsx
      memories/page.tsx
      personality/page.tsx
      relationships/page.tsx
      chat/page.tsx
      chat/[sessionId]/page.tsx
      calibration/page.tsx   Phase 4
      privacy/page.tsx
      members/page.tsx
      # voice/page.tsx     Version 2 only — do not create in Version 1
    settings/page.tsx
  (admin)/
    admin/page.tsx           Phase 6
```

`(app)/layout.tsx` is a Server Component that calls `GET /me`. On 401 it redirects to login. Persona layouts fetch the membership and pass a read-only capability map into client islands.

## Server and client split

| Server | Client |
| --- | --- |
| Layouts, persona shell, library first page | Wizard, chat stream, upload progress, MFA entry, review buttons |
| Read cookies and forward them on server fetches | `EventSource` or `fetch` stream for SSE |

Do not put persona biography into a client cache that survives logout. Query keys include persona id. TanStack Query is optional; start with server fetches plus small client state.

## State

- Session: HttpOnly cookie. The client learns identity from `/me`.
- Wizard: React Hook Form plus Zod, local until submit.
- Chat: messages from the server, optimistic user bubble, streaming assistant bubble.
- Jobs: poll every 2 seconds while status is non-terminal, then stop.

No global store.

## Chat streaming

`POST` the message with `Accept: text/event-stream`. Parse events. Render Markdown with a small allowlist (emphasis, paragraphs, lists). Do not render raw HTML. Citation markers become buttons that open the quote.

The composer stays usable on a failed stream and offers retry.

## Uploads

1. Ask the API for a presigned URL.
2. `PUT` the file to object storage from the browser.
3. Call `complete`.
4. Navigate to the import progress view.

Do not proxy file bytes through Next.js.

## Audio

**Version 2 only.** Do not add `MediaRecorder`, TTS players, or voice routes in Version 1. When Version 2 opens: batch recording upload, a play button for stock TTS with a visible "Synthetic voice" label, then duplex over one WebSocket with a keyboard-accessible stop control.

## Components

Shared: `DisclosureBanner`, `PersonaStatus`, `EmptyState`, `ErrorState`, `JobProgress`, `CitationList`, `ConfirmDestructive`, `AudienceBadge`.

The disclosure banner is on every chat view and is not dismissible. The same banner will apply to voice views in Version 2.

## Accessibility

- WCAG 2.2 AA target.
- Visible focus, labeled inputs, status messages via an aria live region for stream start, errors, and job completion.
- Do not rely on color for review status.
- Respect `prefers-reduced-motion`.
- Chat is a log with headings per day, not an infinite unlabeled div.

## Responsive behavior

- Desktop: sidebar navigation for persona sections.
- Under 768 px: top bar and a sheet for navigation. Chat composer sticks to the bottom. Library tables become stacked rows.
- The landing page is a single column on small screens. No grief-themed illustration that implies the dead are present.

## Empty, loading, and error states

| View | Empty | Error |
| --- | --- | --- |
| Dashboard | Explain creating a first persona | Retry `/me` |
| Library | Invite an upload | List partial files |
| Review | "Nothing waiting" | Keep previously loaded items |
| Chat | Suggested prompts that do not invent facts, such as "What is in the biography?" | Abstention and provider failure are different copy |
| Legacy draft | "Conversations stay off until you finish the authorization note" | — |

## Navigation

Landing → register → verify → dashboard → wizard → persona overview.

Persona subnav: Overview, Library, Review, Memories, Personality, Chat, Privacy, Members. Relationships and Calibration appear when Phase 4 exists. Voice is Version 2 and must not appear in Version 1 navigation. Admin is a separate entry only for platform admins, visually distinct so it is not mistaken for persona content.
