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
