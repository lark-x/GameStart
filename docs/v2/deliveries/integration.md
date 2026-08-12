# V2 Integration Delivery

Status: Slice A-C integrated; local validation complete, pending CI/maintainer acceptance

Branch: `codex/v2-integration`

## Integrated branches

- Bootstrap: `d1c00469b66b39d14417a0a6b36815a947a5ecc5`
- AI-1 Core: `fc86bea96028daec103b8669a9d5624223215c44`
- AI-2 Generation/Assets: `f2cd7e609cabedd61fc5289b193c7247f35dac79`
- AI-3 Web: `1e9a0dae684b29a64ae70cc6d7e81fad6f49b085`

All three business branches have the accepted Bootstrap commit as their exact merge base. They were merged into the integration branch in Core, Generation/Assets, Web order.

## Integration decisions and fixes

- Registered Core and Generation SQLite migrations in one deterministic registry and made each migration plus registry record atomic.
- Added the V2 API runtime and executable entrypoint, wiring Core, Generation and Asset repositories to one SQLite database.
- Implemented the shared `CanonSnapshotReaderPort` from Core SQLite facts and hardened `CandidateSubmissionPort` to accept only validated pending scene candidates at the current canon revision.
- Changed scene candidate review so only approval advances canon revision; reject/request-changes remain auditable without making the candidate baseline stale.
- Extended release preflight to validate typed-state keys and types used by gates and consequences before an immutable release is created.
- Replaced the Web Http adapter's fixture overlay and proposal paths with authoritative Core and Generation/Asset routes, explicit empty-workspace bootstrap, and real release/runtime/save/export state.
- Added recursive V2 test discovery to `packages/ai`.
- Added isolated Playwright ports and V2 Mock plus real HTTP/SQLite core paths so unrelated local services cannot be silently reused.

## Runtime commands

- V2 API: `pnpm --filter @living-network/api dev:v2`
- Optional SQLite path: `V2_SQLITE_PATH=/absolute/path/to/file.sqlite`
- Web: `pnpm --filter @living-network/web dev`
- V2-only E2E: `pnpm exec playwright test v2-core-paths.spec.ts --workers=1`

## Explicit deferrals and evidence boundary

- Slice D Qdrant and Social Temp remain deferred by the accepted master plan.
- Scene Worker, Asset Worker and dispatch pump are implemented and tested through injected Fake services and SQLite repositories. The V2 API process does not itself start Redis consumers or external providers.
- Real Redis, LLM, ComfyUI and Qdrant have not been claimed as accepted by this integration. Their absence does not block the offline Canon/Release/Runtime path.
- V1 remains present and keeps its PostgreSQL/Redis regression path until a separate replacement/cutover decision is accepted.

## Local validation summary

- Frozen dependency install, architecture boundaries, TypeScript, all workspace tests, all builds, Web lint, integration tests, diff check and Playwright 13/13: exit 0.
- V2 runtime migration/composition, Core/Generation API, SQLite repositories, Worker Fake LLM/ComfyUI paths and both V2 browser scenarios are included in those passing checks.
- `pnpm test:coverage`: exit 1. All tests inside the command passed, but the repository-wide configured threshold is 100% lines while the measured total is 90.49%. The integration does not lower the threshold, delete assertions or add exclusions. This must remain visible for CI/maintainer disposition before merging to `main`.
- Real-service acceptance was not run: PostgreSQL/Redis integration cases, real LLM, real ComfyUI and Qdrant remained skipped without their explicit environment switches and services.
