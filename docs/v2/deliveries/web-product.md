# V2 Web Product Delivery

Branch: `codex/v2-web-product`

## Checkpoint 1: V2 App Shell + Typed Adapters

Scope:

- Expanded `/v2` from the Gate 0 shell into a creator workspace shell with Canon, Graph, Review, Release, Player, and Operations areas.
- Added a V2 Pinia workspace store under `apps/web/src/v2/stores`.
- Added typed `V2WorkspaceAdapter` plus Mock and Http adapter implementations under `apps/web/src/v2/adapters`.
- Added Web-local mock fixtures under `apps/web/src/v2/fixtures` that satisfy shared contract types without modifying `packages/contracts`.
- Added adapter and store tests under `apps/web/src/v2`.

Interface requests:

- See `docs/v2/interface-requests/web-product.md`.

Validation:

- `pnpm --filter @living-network/web typecheck` -> exit 0
- `pnpm --filter @living-network/web test` -> exit 0
- `pnpm --filter @living-network/web lint` -> exit 0
- `pnpm --filter @living-network/web build` -> exit 0
- Playwright `/v2` desktop 1280px and mobile 360px checks -> no horizontal overflow, 6 tabs exposed with accessible names, refresh control focusable, status rail present.

Notes:

- The Http adapter calls `/api/v2/health` and maps error envelopes. Until Slice A backend endpoints exist, workspace snapshot body data remains fixture-backed and marked as a Web proposal.

## Checkpoint 2: Canon + Graph + Typed State

Scope:

- Added mock-driven Canon workspace detail for world premise, characters, locations, facts, and rules.
- Added preview-only Canon draft editing with expected revision conflict feedback in the V2 store.
- Added Narrative Graph scene cards with reachability and diagnostics.
- Added Typed State variable summary and scene delta preview inside the Operations area.
- Extended Web-local fixtures and adapter/store tests; no shared contracts, domain, API, database, worker, root entry, or lockfile changes.

Interface requests:

- `IR-WEB-001` remains open for replacing fixture-backed snapshot data.
- Added `IR-WEB-002` for Canon/Graph/Typed State read and preview endpoints.

Validation:

- `pnpm --filter @living-network/web typecheck` -> exit 0
- `pnpm --filter @living-network/web test` -> exit 0
- `pnpm --filter @living-network/web lint` -> exit 0
- `pnpm --filter @living-network/web build` -> exit 0
- `pnpm check:boundaries` -> exit 0
- Playwright `/v2` desktop 1280px and mobile 360px checks -> no horizontal overflow, Canon/Graph/Ops areas reachable by role, revision conflict control accessible, status rail present.

## Checkpoint 3: Generation Job + Candidate Review

Scope:

- Added mock-backed generation context, job detail, candidate diff, and review action state.
- Added Review area controls for prompt preview, Create Job, context sources, candidate diff, approve, reject, and request changes.
- Extended Mock Adapter and Http Adapter boundaries for generation job creation and candidate review without changing shared contracts.
- Added Web store behavior for job messages, terminal status display, reviewer/reason fields, and candidate status updates.
- Extended adapter/store tests for job creation and review actions.

Interface requests:

- Added `IR-WEB-003` for generation job read/context/candidate diff/review endpoints.

Validation:

- `pnpm --filter @living-network/web typecheck` -> exit 0
- `pnpm --filter @living-network/web test` -> exit 0
- `pnpm --filter @living-network/web lint` -> exit 0
- `pnpm --filter @living-network/web build` -> exit 0
- `pnpm check:boundaries` -> exit 0
- Playwright `/v2` desktop 1280px and mobile 360px checks -> no horizontal overflow, Review tab reachable by role, generation prompt/reviewer/reason accessible by label, approve action updates candidate status.
