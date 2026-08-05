# Worker

The worker currently exposes dependency-free scheduler and execution
boundaries. It materializes enabled one-shot and annual event definitions into
idempotent `ScheduledOccurrence` records, then coordinates a bounded execution
start using character plans and proactive-message budgets. The media boundary
includes a deterministic Fake ComfyUI client and an injected-fetch HTTP client
for ComfyUI `/prompt` submission plus `/history/:promptId` result lookup.
When configured, `RepositoryImageWorkflowResolver` loads a character visual
identity and a versioned template, compiles the scene prompt, and supplies the
workflow JSON to that HTTP client. Progress streaming, object storage, and
final message or moment publication remain later adapters.

The development worker shell is available with:

```sh
pnpm --filter @living-network/worker dev
```

It is intentionally a no-op without an injected repository and story world.
The production process will inject the PostgreSQL repositories and queue
adapter instead of silently using this in-memory shell.

With PostgreSQL and Redis running, the persistent worker can be started with:

```sh
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
REDIS_URL=redis://127.0.0.1:6379 \
  pnpm --filter @living-network/worker start:postgres
```

The process materializes due occurrences, enqueues deterministic occurrence IDs,
processes them with BullMQ, and publishes pending outbox events. Every queue
consumer is idempotent at the domain/repository boundary.
