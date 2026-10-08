# Orchestration

Ingestion is a queue of deterministic stages. Chat is one retrieval and one completion. Review is a status change, not an agent.

```mermaid
flowchart TD
  upload[File stored]
  scan[Scan]
  parse[Parse and normalize]
  extract[Extract trait and memory drafts]
  hold[Pending human review]
  chunk[Chunk]
  embed[Embed allowed chunks]
  ready[Persona readiness]

  upload --> scan
  scan --> parse
  parse --> extract
  extract --> hold
  parse --> chunk
  chunk --> embed
  hold --> ready
  embed --> ready

  msg[User message]
  authz[Authorize and load cards]
  retrieve[Hybrid retrieve]
  assemble[Assemble budgeted prompt]
  complete[Single model stream]
  check[Citation and abstention check]
  save[Save message and conversational memory]

  msg --> authz
  authz --> retrieve
  retrieve --> assemble
  assemble --> complete
  complete --> check
  check --> save
```

There is no planner, critic, or tool-using agent on either path.
