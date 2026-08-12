# Refactor Integration Validation

## Branch

- **Branch**: `codex/refactor-integration`
- **Commit**: `de40204a400fe349b6012207c9cfaaac51d9967a`
- **Date**: 2026-08-11
- **Node**: v24.15.0
- **pnpm**: 11.1.2

## Verification Results

| Command | Result |
|---|---|
| `pnpm check:boundaries` | PASS |
| `pnpm typecheck` | PASS (9/9 workspace projects) |
| `pnpm test` | PASS (all unit tests across all packages) |
| `pnpm build` | PASS |
| `pnpm --filter @living-network/web lint` | PASS (0 errors, 27 pre-existing warnings) |
| `pnpm test:coverage` | FAIL — pre-existing compose.test.ts assertion (unrelated to refactor) |
| `pnpm test:integration` | NOT RUN — requires PostgreSQL + Redis services |
| `pnpm test:e2e` | NOT RUN — requires PostgreSQL + Redis + Playwright browsers |

## Changes in This Round

### Phase 1: Fix LLM Timeout (P0)

- `packages/ai/src/read-timeout.ts`: New `readBodyWithTimeout()` using `response.body.getReader()` + `Promise.race`
- `packages/ai/src/provider.ts`: OpenAI `complete()` uses `readBodyWithTimeout` instead of broken `bodyController.abort()` pattern
- `packages/ai/src/anthropic.ts`: Anthropic `complete()` now has body timeout (was completely unprotected)
- 4 MiB max body size guard
- 3 new tests: body never-ends timeout, no false timeout, oversized body rejection

### Phase 2: Background MediaRef (P1)

- `useChatBackground.ts`: Replaced `importChatBackgroundFile` (dataURL) with `compressChatBackgroundImage` + `store.api.uploadImage` → `media://` ref
- `ChatView.vue` backdrop: resolves `imageRef` through `store.api.mediaUrl()` (backward-compatible)

### Phase 3: Chat Character Switch (P1)

- `useConversations.ts`: `loadConversations` validates `currentConversationId` exists in new list; resets if stale

### Phase 4: Eliminate Duplicate loadMessages (P1)

- `ChatView.vue`: Character watcher defers `loadMessages` to `nextTick`, only calls if `currentConversationId` unchanged

### Phase 5: Boundary Check in CI (P1)

- `.github/workflows/ci.yml`: Added `Check architecture boundaries` step before typecheck
- `scripts/check-boundaries.mjs`: Extended scan to `.vue`, `.tsx`, `.js`, `.mjs` files

### Phase 6: Tighten Web Dependencies (P2)

- Removed 5 unused workspace deps from `apps/web/package.json` (ai, config, database, domain, ports)

## Known Limitations

- `pnpm test:coverage` fails on `infra/compose/compose.test.ts` (pre-existing, unrelated to refactor)
- `pnpm test:integration` and `pnpm test:e2e` require external services (PostgreSQL, Redis) — not verified locally
- `importChatBackgroundFile()` in `theme.ts` is now dead code but retained for potential future use
- SSE initialization still has minor duplication between `ApiApplication.streamConversation()` and `routes/conversations.ts` (P2, skipped)

## Unresolved P2 Technical Debt

- DomainRepositories still a large Repository Bag (future: dependency injection)
- `noUnusedLocals`/`noUnusedParameters` not enabled
- `contracts/src/schemas.ts` still large (future: split into `schemas/`)
- Request body connection hardening (413 pause/drain/destroy) incomplete
- Authentication (`x-actor-character-id`) not production-grade

## Declaration

**未修改 main。未合并 main。未推送 main。**

All changes are on `codex/refactor-integration` only.
