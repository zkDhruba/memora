# Local infrastructure

Docker Compose stack for Phase 1.2+. App processes (`apps/web`, `apps/api`) stay on the host.

## Services

| Service | Host ports | Notes |
| --- | --- | --- |
| Postgres 18 + pgvector | `5432` | User/db/password: `memora` / `memora` / `memora`; volume at `/var/lib/postgresql` (PG18+) |
| Redis 7 | `6379` | AOF enabled |
| Object store (Silo / MinIO API) | `9000` API, `9001` console | Image `pgsty/silo`; user `memora`, password `memoradevpass` |
| Mailpit | `1025` SMTP, `8025` UI | Catch-all email for local auth |
| ClamAV | `3310` | First boot downloads signatures (slow) |

Buckets created by `minio-init` (`pgsty/mc`): `memora-quarantine`, `memora-clean`.

> Official `minio/minio` / `minio/mc` images were removed from Docker Hub (2026). Local compose uses [pgsty/silo](https://github.com/pgsty/silo), which keeps the MinIO S3 API and `MINIO_*` env vars so the AWS SDK config in `.env.example` stays unchanged.

## Commands (from repo root)

```bash
pnpm deps:up      # start in background
pnpm deps:ps      # status
pnpm deps:logs    # follow logs
pnpm deps:down    # stop (keeps volumes)
pnpm deps:reset   # stop and delete volumes (destructive)
```

Copy `.env.example` to `.env` before wiring the API in later tasks.
