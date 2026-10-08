# System context

```mermaid
flowchart LR
  owner[Persona owner]
  participant[Approved participant]
  admin[Platform admin]
  web[Memora web and API]
  llm[Allowlisted model provider]
  mail[Email provider]

  owner --> web
  participant --> web
  admin --> web
  web --> llm
  web --> mail
```

The admin path manages accounts, jobs, and suspensions. It does not read persona content.
