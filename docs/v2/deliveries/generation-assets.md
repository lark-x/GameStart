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

## Checkpoint 2: Job + SQLite Dispatch/Outbox

Scope:

- Added V2 scene generation job and dispatch contracts under `packages/contracts/src/v2/generation`.
- Added AI-2 ports for job persistence, dispatch persistence, and queue payload shape under `packages/ports/src/v2/generation`.
- Added pure domain job transition and retry guards under `packages/domain/src/v2/generation`.
- Added SQLite migration and repository under `packages/database/src/v2/generation`.
- Job creation inserts the job row and pending dispatch row in one transaction.
- Idempotency is enforced per `(story_world_id, idempotency_key)`, with identical replays returning the original job and conflicting payloads rejected.

Non-scope:

- No Worker consumer yet.
- No `CandidateSubmissionPort` invocation yet.
- No ComfyUI, media, asset review, Qdrant, Social Temp, canon, release, save, Web, or shared entrypoint changes.

Contract:

- `V2SceneGenerationJobRecord`
- `V2GenerationDispatchRecord`
- `V2CreateSceneGenerationJobInput`
- `V2GenerationJobRepository`
- `V2GenerationDispatchRepository`
- `V2GenerationJobQueuePayload`

Migration:

- `0100_generation_jobs`
- Creates `v2_generation_jobs` and `v2_generation_dispatches`.
- Adds lookup indexes for job status/context hash and pending dispatch status/request time.

State Machine:

- Job lifecycle: `queued -> claimed -> running -> succeeded|failed|cancelled`.
- Retry path: retryable failures return `failed -> queued` while attempts remain.
- Dispatch lifecycle: `pending -> enqueued`.
- Dispatch enqueue failure remains `pending`, increments attempts, and stores `lastError`.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/domain test`: exit 0
- `pnpm --filter @living-network/domain typecheck`: exit 0
- `pnpm --filter @living-network/database typecheck`: exit 0
- `pnpm --filter @living-network/database test`: exit 0
- `pnpm check:boundaries`: exit 0
- `git diff --check`: exit 0

Known validation note:

- `git diff --check` reported only Git line-ending normalization warnings for existing Windows checkout behavior; no whitespace errors.

External Services:

- Real Redis: not executed; dispatch repository was validated with SQLite tests only.
- Real LLM: not executed; no provider call in checkpoint 2.
- Real ComfyUI: not executed; Slice C scope.
- Qdrant: not executed; Slice D optional scope.

## Checkpoint 3: Worker + CandidateSubmissionPort

Scope:

- Added V2 scene generation worker use case under `apps/worker/src/v2`.
- Worker consumes stable `V2GenerationJobQueuePayload` facts, verifies they match the stored SQLite job, and never treats queue payload as the source of truth.
- Worker calls the injected V2 scene provider helper, strictly parses scene candidate JSON, and submits only through Gate 0 `CandidateSubmissionPort`.
- Worker marks terminal success with submitted `candidateId`, provider response id, and bounded raw output preview.
- Worker skips duplicate consumption after terminal success/failure/cancel.
- Worker recovers expired claimed/running leases back to `queued` before retrying.
- Adjusted generation job claim semantics so terminal `failed` jobs are not claimable.

Non-scope:

- No real BullMQ consumer startup wiring yet; this checkpoint provides the deterministic processor used by queue consumers.
- No direct canon repository reads or writes.
- No second canon candidate table.
- No release/save writes.
- No Generation API yet.
- No ComfyUI, media, asset review, Qdrant, Social Temp, Web, or lockfile changes.

Contract:

- Reuses Gate 0 `CandidateSubmissionPort`.
- Reuses `V2GenerationJobQueuePayload`.
- Extends AI-2 `V2GenerationJobRepository` with `recoverExpiredJobLease`.

Migration:

- Reuses `0100_generation_jobs`.
- No new migration in this checkpoint.

State Machine:

- Job lifecycle remains `queued -> claimed -> running -> succeeded|failed|cancelled`.
- Retryable worker/provider failures return `running -> queued` while attempts remain.
- Retryable worker/provider failures become terminal `failed` when attempts are exhausted.
- Invalid LLM output and mismatched queue payload are terminal `failed`.
- Expired `claimed` or `running` leases recover to `queued`.
- Terminal `succeeded`, `failed`, and `cancelled` jobs are skipped on duplicate consumption.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/domain test`: exit 0
- `pnpm --filter @living-network/domain typecheck`: exit 0
- `pnpm --filter @living-network/database test`: exit 0
- `pnpm --filter @living-network/database typecheck`: exit 0
- `pnpm --filter @living-network/ai typecheck`: exit 0
- `pnpm --filter @living-network/worker test`: exit 0
- `pnpm --filter @living-network/worker typecheck`: exit 0
- `pnpm check:boundaries`: exit 0
- `git diff --check`: exit 0

Known validation note:

- `git diff --check` reported only Git line-ending normalization warnings for existing Windows checkout behavior; no whitespace errors.

Fake Service Evidence:

- Fake LLM success submits one pending candidate through `CandidateSubmissionPort`.
- Fake malformed/empty LLM output fails terminally without candidate submission.
- Fake retryable provider timeout returns to `queued`, then becomes terminal `failed` after attempts are exhausted.
- Duplicate consumption of a terminal job does not resubmit a candidate.
- Expired lease recovery is covered by worker and SQLite repository tests.

External Services:

- Real Redis: not executed; queue consumer startup wiring is outside this checkpoint.
- Real LLM: not executed; worker tests use injected fake provider.
- Real ComfyUI: not executed; Slice C scope.
- Qdrant: not executed; Slice D optional scope.
