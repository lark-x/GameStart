# AI-2 Generation Assets Delivery

Status: in progress

Branch: `codex/v2-generation-assets`

Base: `d1c00469b66b39d14417a0a6b36815a947a5ecc5`

## Checkpoint 1: Provider + Generation Context

Scope:

- Added V2 generation context contract types in `packages/contracts/src/v2/generation`.
- Added pure domain rules for generation context snapshots:
  - prompt trimming and non-empty validation
  - token budget bounds
  - source fact/character/scene ID capture
  - deterministic `sha256:` context hash
- Added strict scene candidate JSON parser in `packages/domain/src/v2/generation`.
- Added V2 scene provider helper in `packages/ai` that requests JSON output from an injected `ChatProvider` and returns raw provider output for downstream domain parsing.

Non-scope:

- No SQLite generation job or migration yet.
- No dispatch/outbox implementation yet.
- No Worker consumer yet.
- No `CandidateSubmissionPort` call yet.
- No ComfyUI, media, asset review, Qdrant, Social Temp, canon, release, save, or Web changes.

Contract:

- New generation context snapshot contract is additive under AI-2 owner path.
- Shared Gate 0 ports and shared contracts were not modified.

Migration:

- None in this checkpoint.

State Machine:

- None introduced in this checkpoint.
- Job lifecycle remains for the next Slice B checkpoint.

Verification:

- `pnpm --filter @living-network/domain test`: exit 0
- `pnpm --filter @living-network/domain typecheck`: exit 0
- `pnpm --filter @living-network/ai typecheck`: exit 0
- `pnpm check:boundaries`: exit 0
- `node --test packages\ai\src\v2-scene-generation.test.ts`: exit 0
- `node scripts\run-tests.mjs packages\domain\src\v2\generation`: exit 0

Known validation note:

- `pnpm --filter @living-network/ai test` exited 1 because an existing profile/observability test expected `LLM request failed|fetch` but received `ProviderError: LLM request timed out`. The new V2 AI test file passed independently.
- Initial direct `node --test` runs without escalation failed with `spawn EPERM`; reruns with approved escalation passed.

External Services:

- Real Redis: not executed; not part of checkpoint 1.
- Real LLM: not executed; provider helper uses injected fake provider in tests.
- Real ComfyUI: not executed; Slice C scope.
- Qdrant: not executed; Slice D optional scope.
