# Local infrastructure

`docker-compose.yml` provides the local PostgreSQL, Redis and MinIO services
used by the planned production adapters. Images are pinned to explicit tags;
the development credentials are intentionally local-only defaults.

## Start

```sh
cp .env.example .env
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d
docker compose -f infra/compose/docker-compose.yml ps
```

The current repository still uses an explicit SQL client boundary and does not
run migrations automatically. Apply migrations in numeric order after the
database health check, beginning with `packages/database/migrations/0001_*` and
ending at the newest migration.

## Stop

```sh
docker compose -f infra/compose/docker-compose.yml --env-file .env down
```

Use `down -v` only when intentionally deleting local PostgreSQL, Redis and
MinIO data. Production credentials and persistent volumes must be managed
outside this development file.

For the real PostgreSQL/Redis integration test, start the services and run:

```sh
RUN_REAL_INTEGRATION=1 \
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
REDIS_URL=redis://127.0.0.1:6379 \
  node --test integration/*.test.ts
```

Without `RUN_REAL_INTEGRATION=1`, the test is skipped so unit CI does not
silently depend on local containers.
