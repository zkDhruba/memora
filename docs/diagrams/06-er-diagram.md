# Entity relationship

Candidate tables from the brief that do not appear here were merged or deferred. Evaluation runs are Phase 4. Voice profiles are Version 2. Both are omitted from the MVP diagram.

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ mfa_factors : has
  users ||--o{ persona_memberships : joins
  personas ||--o{ persona_memberships : grants
  personas ||--o{ consents : requires
  personas ||--o{ source_imports : receives
  source_imports ||--o{ source_files : contains
  source_files ||--o{ source_file_versions : versions
  source_files ||--o{ source_participants : labels
  source_files ||--o{ source_threads : contains
  source_threads ||--o{ source_messages : contains
  source_participants ||--o{ source_messages : speaks
  source_file_versions ||--o{ documents : parses
  documents ||--o{ document_chunks : splits
  source_messages ||--o{ document_chunks : windows
  document_chunks ||--o{ chunk_embeddings : embeds
  personas ||--|| personality_profiles : compiles
  personality_profiles ||--o{ personality_traits : includes
  personality_traits ||--o{ personality_evidence : supports
  personas ||--o{ relationships : knows
  relationships ||--o{ relationship_claims : receives
  personas ||--o{ memories : stores
  memories ||--o{ memory_evidence : supports
  memories ||--o{ memory_conflicts : disputes
  personas ||--o{ conversation_sessions : hosts
  users ||--o{ conversation_sessions : starts
  conversation_sessions ||--o{ conversation_messages : contains
  conversation_messages ||--o{ message_citations : cites
  conversation_sessions ||--o{ memories : conversational_only
  document_chunks ||--o{ message_citations : cited_by
```

`memories.domain` is `biographical` or `conversational`. The conversational link to `conversation_sessions` is required only for that domain. Biographical memories point at `memory_evidence`, not at chat sessions.
