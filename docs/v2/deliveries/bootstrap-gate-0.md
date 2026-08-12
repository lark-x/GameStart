# V2 Bootstrap Gate 0 Delivery

Status: implementation branch draft

Branch: `codex/v2-bootstrap`

## Scope

This delivery implements only the Gate 0 parallel-development skeleton from `docs/v2/ai-parallel-master-plan.md`.

It adds:

- V2 shared contract primitives, error envelope, pagination, revision/idempotency, job status, candidate status, and `SceneCandidatePayload`.
- V2 shared ports: `CanonSnapshotReaderPort`, `CandidateSubmissionPort`, and `ApprovedAssetReaderPort`.
- V2 domain shared review transition helper and domain error type.
- Fastify composition root for `/api/v2`, including `/api/v2/health`, empty core plugin, and empty generation plugin.
- SQLite platform connection factory, transaction helper, migration registry, and temporary test database helper using Node 24 `node:sqlite`.
- V2 fixture examples for world, scene graph, candidate, release preflight, and run.
- Web `/v2` route mount and minimal shell that does not initialize V1 world/character state.
- Worker V2 namespace placeholder and sentinel test.
- Recursive test discovery script and V2 sentinel tests.

## Explicit Non-Scope

Gate 0 does not implement:

- Canon CRUD.
- Narrative graph editing or validation.
- Typed state schema or state transitions.
- Candidate approval/apply use cases.
- Generation jobs, Worker consumers, LLM calls, ComfyUI calls, Qdrant, release creation, runtime play, save/load, export, or full V2 Web pages.

## Frozen Shared Surfaces

After bootstrap approval, business branches should treat these files as shared/frozen unless the maintainer explicitly approves a coordinated change:

- `apps/api/src/v2/platform/**`
- `apps/api/src/v2/core/plugin.ts`
- `apps/api/src/v2/generation/plugin.ts`
- `apps/web/src/router/index.ts`
- `apps/web/src/App.vue`
- `apps/web/src/v2/index.ts`
- `apps/worker/src/v2/index.ts`
- `packages/contracts/src/v2/shared/**`
- `packages/contracts/src/v2/fixtures/**`
- `packages/domain/src/v2/shared/**`
- `packages/ports/src/v2/shared/**`
- `packages/database/src/v2/platform/**`
- package test scripts, root coverage script, and `pnpm-lock.yaml`

## Validation

Validation commands and exit codes are reported in the final handoff for the bootstrap commit.
