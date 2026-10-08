# 15 — Infrastructure and deployment

Related: [04-technology-stack.md](04-technology-stack.md), [16-cost-and-scaling.md](16-cost-and-scaling.md).

## Local development

Docker Compose runs Postgres (image with pgvector, tag aligned to pgvector 0.8.x / Postgres 18), Redis, MinIO, ClamAV, and Mailpit. The API, worker, and Next.js run on the host for fast reload, with an optional Compose profile that containers them.

```text
web      localhost:3000
api      localhost:4000
minio    localhost:9000
mailpit  localhost:8025
postgres localhost:5432
redis    localhost:6379
```

A `make dev` or `pnpm dev` starts Compose dependencies and both Node processes. Migrations run via `pnpm db:migrate`. Seeds are opt-in.

Environment sample: `DATABASE_URL`, `REDIS_URL`, `S3_*`, `APP_DATA_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, `WEB_ORIGIN`, `COOKIE_SECRET`. Never commit filled env files.

## Production, single server (default through early production)

One VM, Docker Compose, Caddy terminating TLS and routing:

- `app.example` → web
- `api.example` → api
- Object storage is external (S3-compatible), not MinIO on the same disk as the database, so a disk failure does not take both. MinIO on the VM is acceptable only for a prototype.

Postgres and Redis run as containers with volumes, or Postgres runs as a managed service when backups become the bottleneck. Start with containers plus a nightly `pg_dump` to object storage if the operator can test restores. Move to managed Postgres before real users depend on it.

No Kubernetes. One VM can run the API twice and the worker twice under Compose. When that host is saturated, split worker onto a second VM that shares Postgres and Redis. That is still not a cluster orchestrator.

## Production, managed cloud (when the single server is not enough)

- Web and API on a small container platform or two VMs behind a load balancer.
- Managed Postgres with pgvector available. Confirm the extension before choosing the vendor. If the managed offering lags pgvector 0.8, stay on a VM image you control.
- Managed Redis.
- S3, R2, or Hetzner Object Storage.
- Secret manager.
- Still one codebase. Still no Kafka.

## HTTPS and headers

Caddy obtains certificates. Redirect HTTP to HTTPS. HSTS after the first stable domain. API CORS allows only the web origin. Cookies: `Secure`, `HttpOnly`, `SameSite=Lax`.

## CI/CD

GitHub Actions:

1. Install, typecheck, unit test, migration SQL lint if added.
2. Integration tests with service containers for Postgres and Redis.
3. On main, build images and deploy by SSH or a Compose pull on the VM. Manual approval for production.

No deploy keys inside the repo. OIDC or a scoped deploy key on the host.

## Health

- `GET /health/live` process up.
- `GET /health/ready` Postgres, Redis, and object storage head-bucket.
- Worker heartbeat key in Redis, alert if older than 60 seconds.
- Queue depth alert on the dead-letter queue.

## Backups and recovery

| Asset | Method | Target |
| --- | --- | --- |
| Postgres | Nightly dump plus WAL if managed | 30 days |
| Objects | Versioning or replication | 30 days |
| Redis | Not backed up as truth. Jobs can be replayed from `processing_jobs` rows stuck in `queued` | — |
| Secrets | Stored in the manager, exported to an offline envelope quarterly | — |

RPO 24 hours for the single-server stage. RTO one working day. Write these into the runbook and test one restore in Phase 6. Managed Postgres can tighten RPO later.

## Scaling path

| Pressure | Move |
| --- | --- |
| API CPU | Second API replica |
| Queue lag | Second worker |
| Postgres CPU | Larger VM, then read replica for library lists only. Vectors stay on the primary until measured |
| Object bandwidth | Already off-box |
| LLM latency | Not solved by more app servers |

## Observability

- JSON logs to the VM journal, shipped later to a cheap log sink.
- Langfuse Cloud for LLM traces in early production.
- OpenTelemetry from Nest 12's observe package in Phase 6, exported to a collector on the same VM.
- Alerts: ready check down, disk > 80%, dead-letter > 0, error rate, daily token spend over budget.

## Differences between the two production shapes

| | Single server | Managed |
| --- | --- | --- |
| Cost | Low, mostly the VM and APIs | Higher floor |
| Operator load | You patch, backup, and restore | Vendor patches the data plane |
| pgvector | You choose the image | Must verify the extension |
| Failure domain | One host | Split |
| When | Prototype through early production | When restore drills or uptime needs exceed what you will do by hand |

Hetzner Cloud list prices for new orders in Germany and Finland, effective 15 June 2026, excluding VAT and the IPv4 address: CX23 (2 vCPU, 4 GB) €5.49/month, CX33 (4 vCPU, 8 GB) €8.49/month, CX43 (8 vCPU, 16 GB) €15.99/month. Source: Hetzner price-adjustment documentation, retrieved 8 October 2026. A tracker reported primary IPv4 at €0.50/month; confirm in the console. Object-storage base price was **not** taken from that official table in this session; secondary writeups conflict on VAT. Confirm in the console before budgeting storage. See [16-cost-and-scaling.md](16-cost-and-scaling.md).
