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

## Checkpoint 4: Release + Player + Save/Restore + Export

Scope:

- Added Release desk preflight summary, immutable release package details, and export preview controls.
- Added Player runtime scene view, choice submission, save label, save/restore controls, and save detail summary.
- Extended Mock Adapter and Http Adapter boundaries for release creation, runtime choice submission, save/restore, and export.
- Extended Web store actions and tests for release, player, save, restore, and export.
- Kept all implementation inside `apps/web/src/v2/**` plus this Web delivery/interface documentation.

Interface requests:

- Added `IR-WEB-004` for release/runtime/save/export endpoints and response shapes.

Validation:

- `pnpm --filter @living-network/web typecheck` -> exit 0
- `pnpm --filter @living-network/web test` -> exit 0
- `pnpm --filter @living-network/web lint` -> exit 0
- `pnpm --filter @living-network/web build` -> exit 0
- `pnpm check:boundaries` -> exit 0
- Playwright `/v2` desktop 1280px and mobile 360px checks -> no horizontal overflow, Release and Player tabs reachable by role, export format and save label accessible, create release/export/choice/save/restore flows complete in Mock mode.

## Checkpoint 5: Assets

Scope:

- Added an Assets area to the `/v2` workspace shell for local asset generation jobs, candidate review, and approved asset library inspection.
- Extended Web-local asset DTOs, fixtures, Mock Adapter, Http Adapter proposal methods, and Pinia store actions under `apps/web/src/v2/**`.
- Added asset prompt submission, candidate metadata, workflow version, seed, media refs, validation notes, and approve/reject/request-changes controls.
- Extended adapter/store tests for asset job creation and asset candidate approval without changing shared contracts, domain, API, database, worker, root entry, or lockfile.

Interface requests:

- Added `IR-WEB-005` for asset job, asset candidate review, and approved asset library endpoints.

Validation:

- `pnpm --filter @living-network/web typecheck` -> exit 0
- `pnpm --filter @living-network/web test` -> exit 0
- `pnpm --filter @living-network/web lint` -> exit 0
- `pnpm --filter @living-network/web build` -> exit 0
- `pnpm check:boundaries` -> exit 0
- Playwright `/v2` desktop 1280px and mobile 360px checks -> no horizontal overflow, Assets tab reachable by role, asset prompt/review reason accessible by label, Create Asset Job and Approve Asset mock flows complete, approved asset library updates.
