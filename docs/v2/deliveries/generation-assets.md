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

## Checkpoint 4: Generation API

Scope:

- Added injectable V2 generation Fastify plugin factory under `apps/api/src/v2/generation`.
- Added context preview endpoint that reads the requested canon revision through `CanonSnapshotReaderPort` and builds a deterministic generation context snapshot.
- Added scene job creation endpoint that builds the same context snapshot, derives a stable job id from world/revision/idempotency key, and writes through `V2GenerationJobRepository`.
- Added job read and cancel endpoints.
- Added generation-specific API DTOs under `packages/contracts/src/v2/generation` without changing Gate 0 shared wire v0 names.
- Kept the Gate 0 default `v2GenerationPlugin` hook intact and did not modify the shared Fastify composition root.

Routes:

- `POST /api/v2/generation/context-preview`
- `POST /api/v2/generation/jobs/scene`
- `GET /api/v2/generation/jobs/:jobId`
- `POST /api/v2/generation/jobs/:jobId/cancel`

Non-scope:

- No candidate list/review/apply API; those remain AI-1 Core API responsibilities.
- No real BullMQ dispatch pump wiring from API.
- No direct canon repository reads or writes.
- No second canon candidate table.
- No release/save writes.
- No ComfyUI, media, asset review, Qdrant, Social Temp, Web, shared composition root, or lockfile changes.

Contract:

- `V2GenerationContextPreviewApiRequest`
- `V2GenerationContextPreviewApiResponse`
- `V2CreateSceneGenerationJobApiRequest`
- `V2CreateSceneGenerationJobApiResponse`
- `V2GenerationJobApiResponse`

Migration:

- Reuses `0100_generation_jobs`.
- No new migration in this checkpoint.

State Machine:

- API creates jobs in `queued`.
- API cancel writes `cancelled` through `V2GenerationJobRepository`.
- Worker-owned claim/running/success/failure transitions are unchanged from checkpoint 3.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/domain typecheck`: exit 0
- `pnpm --filter @living-network/api typecheck`: exit 0
- `pnpm --filter @living-network/api test`: exit 0
- `pnpm check:boundaries`: exit 0
- `git diff --check`: exit 0

Known validation note:

- `git diff --check` reported only Git line-ending normalization warnings for existing Windows checkout behavior; no whitespace errors.

Fake Service Evidence:

- API tests use fake canon snapshot reader and fake generation job repository.
- Context preview verifies requested revision usage and `sha256:` context hash creation.
- Scene job create verifies idempotent replay and stable persisted job state.
- Job read/cancel and validation/404 responses are covered through Fastify injection.

External Services:

- Real Redis: not executed; API does not start a real queue or dispatch worker in this checkpoint.
- Real LLM: not executed; API only creates job facts and context snapshots.
- Real ComfyUI: not executed; Slice C scope.
- Qdrant: not executed; Slice D optional scope.

## Checkpoint 5: Asset Job + Fake ComfyUI Candidate

Scope:

- Added V2 asset generation contracts under `packages/contracts/src/v2/generation`.
- Added AI-2 asset job, asset candidate, and asset queue payload ports under `packages/ports/src/v2/generation`.
- Added domain validation for controlled asset media refs and asset candidate provenance inputs under `packages/domain/src/v2/generation`.
- Added SQLite migration and repository under `packages/database/src/v2/generation`.
- Added V2 asset worker use case under `apps/worker/src/v2`.
- Asset worker consumes stable `V2AssetGenerationJobQueuePayload` facts, verifies workflow version against the stored SQLite job, and never treats queue payload as source of truth.
- Asset worker uses an injected `ComfyUiClient`, persists external job id, resolves the media result, validates the controlled media ref, writes a pending asset candidate, and then marks the asset job succeeded.
- Duplicate terminal consumption skips without creating duplicate asset candidates.
- Expired claimed/running leases recover to `queued` before retrying.

Non-scope:

- No asset approval transaction yet.
- No approved asset/media facts yet.
- No release/save/canon writes.
- No asset API yet.
- No real BullMQ consumer startup wiring.
- No Qdrant, Social Temp, Web, shared composition root, or lockfile changes.

Contract:

- `V2AssetGenerationJobRecord`
- `V2CreateAssetGenerationJobInput`
- `V2AssetCandidatePayload`
- `V2AssetCandidateRecord`
- `V2AssetGenerationJobRepository`
- `V2AssetCandidateRepository`
- `V2AssetGenerationJobQueuePayload`

Migration:

- `0101_asset_generation_jobs`
- Creates `v2_asset_generation_jobs`, `v2_asset_generation_dispatches`, and `v2_asset_candidates`.
- Adds lookup indexes for asset job status, external job id, asset dispatch status/request time, and asset candidate status.

State Machine:

- Asset job lifecycle: `queued -> claimed -> running -> succeeded|failed|cancelled`.
- ComfyUI submission is recorded as `externalJobId`/`submittedAt` while the job remains `running`.
- Retryable ComfyUI failures return `running -> queued` while attempts remain.
- Retryable ComfyUI failures become terminal `failed` when attempts are exhausted.
- Unsafe media refs and mismatched queue payloads are terminal `failed`.
- Expired `claimed` or `running` leases recover to `queued`.
- Terminal `succeeded`, `failed`, and `cancelled` jobs are skipped on duplicate consumption.
- Asset candidates start as `pending`; approval is deliberately left for the next Slice C checkpoint.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/domain test`: exit 0
- `pnpm --filter @living-network/domain typecheck`: exit 0
- `pnpm --filter @living-network/database test`: exit 0
- `pnpm --filter @living-network/database typecheck`: exit 0
- `pnpm --filter @living-network/worker test`: exit 0
- `pnpm --filter @living-network/worker typecheck`: exit 0
- `pnpm check:boundaries`: exit 0
- `git diff --check`: exit 0

Known validation note:

- `git diff --check` reported only Git line-ending normalization warnings for existing Windows checkout behavior; no whitespace errors.

Fake Service Evidence:

- Fake ComfyUI success creates one pending asset candidate with controlled `media://fake-comfy/...` media ref.
- Fake duplicate terminal consumption does not duplicate candidates.
- Fake retryable ComfyUI timeout returns to `queued`, then becomes terminal `failed` after attempts are exhausted.
- Fake unsafe media ref fails terminally without candidate creation.
- Fake recovered external ComfyUI job resumes from persisted `externalJobId` without resubmitting.

External Services:

- Real Redis: not executed; queue consumer startup wiring is outside this checkpoint.
- Real LLM: not executed; Slice C asset worker does not call LLM.
- Real ComfyUI: not executed; worker tests use injected fake ComfyUI clients.
- Qdrant: not executed; Slice D optional scope.

## Checkpoint 6: Asset Review + Approved Asset Facts

Scope:

- Added V2 asset candidate review contracts under `packages/contracts/src/v2/generation`.
- Added AI-2 asset review repository port under `packages/ports/src/v2/generation`.
- Added SQLite migration and repository behavior under `packages/database/src/v2/generation`.
- Asset review reuses the shared V2 review transition semantics from `packages/domain/src/v2/shared/review.ts`.
- Review writes candidate status, audit record, and approved asset facts in one SQLite transaction.
- Identical `(candidate_id, idempotency_key)` review replays return the original review; conflicting replay payloads are rejected.
- Approval writes an approved asset fact with controlled `mediaRef` and deterministic `sha256:` content hash.
- `V2SqliteAssetGenerationRepository` now implements the AI-2 `V2AssetReviewRepository` and Gate 0 `ApprovedAssetReaderPort`.

Non-scope:

- No asset review API endpoint yet.
- No direct canon repository reads or writes.
- No release/save writes.
- No asset review writes to AI-1 canon candidate tables.
- No real Redis, LLM, ComfyUI, Qdrant, Social Temp, Web, shared composition root, or lockfile changes.

Contract:

- `V2AssetReviewAction`
- `V2AssetCandidateReviewRecord`
- `V2ApprovedAssetRecord`
- `V2ReviewAssetCandidateInput`
- `V2AssetCandidateReviewResult`
- `V2AssetReviewRepository`
- `ApprovedAssetReaderPort` implementation in the AI-2 SQLite asset repository

Migration:

- `0102_asset_candidate_review`
- Creates `v2_asset_candidate_reviews` and `v2_approved_assets`.
- Adds a unique review replay boundary on `(candidate_id, idempotency_key)`.
- Adds one approved asset fact per `asset_id` and per approved `candidate_id`.
- Adds lookup indexes for candidate review history, approved asset lookup, and release asset reads.

State Machine:

- Asset candidate review lifecycle reuses shared transitions:
  - `pending -> approved|rejected|changes_requested`
  - `changes_requested -> approved|rejected`
  - `approved` and `rejected` are terminal
- `approve` updates the candidate to `approved`, writes the review audit row, and writes an approved asset fact in the same transaction.
- `reject` updates the candidate to `rejected` and writes the review audit row only.
- `request_changes` updates the candidate to `changes_requested` and writes the review audit row only.
- Review replay with the same idempotency key is read-only when the payload matches.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/domain typecheck`: exit 0
- `pnpm --filter @living-network/domain test`: exit 0
- `pnpm --filter @living-network/database typecheck`: exit 0
- `pnpm --filter @living-network/database test`: exit 0
- `pnpm check:boundaries`: exit 0
- `pnpm typecheck`: exit 0
- `git diff --check`: exit 0

Known validation note:

- Initial direct `pnpm --filter @living-network/database test` and `pnpm typecheck` runs inside the sandbox failed with `spawn EPERM`; reruns with approved escalation passed.
- `git diff --check` reported only Git line-ending normalization warnings for the Windows checkout; no whitespace errors.

Fake Service Evidence:

- SQLite tests approve a pending asset candidate and verify the review audit row, candidate status, approved asset fact, and `sha256:` content hash.
- SQLite tests replay the same review idempotency key without rewriting and reject conflicting replay payloads.
- SQLite tests verify `reject` and `request_changes` do not create approved asset facts.
- SQLite tests verify `ApprovedAssetReaderPort` reads approved assets by asset id and release binding.

External Services:

- Real Redis: not executed; no queue consumer wiring changed in this checkpoint.
- Real LLM: not executed; asset review does not call LLM.
- Real ComfyUI: not executed; this checkpoint reviews already-created fake media refs.
- Qdrant: not executed; Slice D optional scope.

## Checkpoint 7: Controlled Asset Media Store

Scope:

- Added an AI-2 `V2AssetMediaStorePort` under `packages/ports/src/v2/generation`.
- Added `V2LocalAssetMediaStore` under `apps/worker/src/v2` for controlled local asset media persistence.
- The store fetches external ComfyUI image URLs, validates image responses, bounds byte size, writes a temporary file, and then uses atomic rename into `mediaRoot/v2/assets/<sha256>.<ext>`.
- Stored worker-facing references are `media://local/...`; raw external `/view` URLs are not written into SQLite candidate or job facts.
- Replayed media storage for the same bytes returns the same content-addressed media ref.
- The V2 asset worker now accepts existing controlled refs directly and uses the media store for external ComfyUI URLs when provided.
- Retryable media write/fetch failures reuse the existing asset job retry state machine and do not create asset candidates.

Non-scope:

- No asset API endpoint yet.
- No thumbnail derivative pipeline yet; this checkpoint stores the primary controlled image asset.
- No direct canon repository reads or writes.
- No release/save writes.
- No real Redis, LLM, ComfyUI, Qdrant, Social Temp, Web, shared composition root, or lockfile changes.

Contract:

- `V2StoreGeneratedAssetMediaInput`
- `V2StoredAssetMediaResult`
- `V2AssetMediaStorePort`

Migration:

- None in this checkpoint.
- Reuses `0101_asset_generation_jobs` for asset job/candidate facts and `0102_asset_candidate_review` for approved asset facts.

State Machine:

- Asset job lifecycle remains `queued -> claimed -> running -> succeeded|failed|cancelled`.
- Controlled `media://fake-comfy/...` or `media://local/...` output continues directly to pending candidate creation.
- External ComfyUI URL output is stored first; only the resulting `media://local/...` ref is persisted.
- Retryable media storage failures return `running -> queued` while attempts remain, and do not create candidates.
- Non-retryable invalid media output becomes terminal `failed` and does not create candidates.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/database typecheck`: exit 0
- `pnpm --filter @living-network/worker typecheck`: exit 0
- `pnpm --filter @living-network/worker test`: exit 0
- `pnpm check:boundaries`: exit 0
- `pnpm typecheck`: exit 0
- `pnpm test`: exit 0
- `pnpm build`: exit 0
- `git diff --check`: exit 0

Known validation note:

- `git diff --check` reported only Git line-ending normalization warnings for the Windows checkout; no whitespace errors.

Fake Service Evidence:

- Worker tests store an external ComfyUI URL as a controlled `media://local/...` ref before candidate creation.
- Worker tests verify retryable media store failures return the asset job to `queued` without creating a candidate.
- Local media store tests verify content-addressed `sha256:` refs, image content validation, max byte enforcement, replay, and no leftover `.tmp` file after successful rename.

External Services:

- Real Redis: not executed; no queue consumer wiring changed in this checkpoint.
- Real LLM: not executed; asset media storage does not call LLM.
- Real ComfyUI: not executed; tests inject fake fetch and fake ComfyUI clients.
- Qdrant: not executed; Slice D optional scope.

## Checkpoint 8: Asset Generation API

Scope:

- Added injectable V2 asset generation routes under `apps/api/src/v2/generation`.
- Asset job creation derives a stable job id from story world, idempotency key, and workflow version, then writes through the injected `V2AssetGenerationJobRepository`.
- Asset job read and cancel routes use the same repository boundary as the worker and SQLite adapter.
- Asset candidate read and review routes use injected asset candidate/review repositories.
- Asset candidate approval returns approved asset facts from the AI-2 asset review transaction and does not write canon, release, or save state.
- Missing asset repository capabilities return 501 instead of silently pretending that asset APIs are wired in the shared composition root.
- Added asset API request/response DTOs under `packages/contracts/src/v2/generation`.

Routes:

- `POST /api/v2/generation/assets/jobs`
- `GET /api/v2/generation/assets/jobs/:jobId`
- `POST /api/v2/generation/assets/jobs/:jobId/cancel`
- `GET /api/v2/generation/assets/candidates/:candidateId`
- `POST /api/v2/generation/assets/candidates/:candidateId/review`

Non-scope:

- No shared Fastify composition root wiring.
- No real BullMQ dispatch pump or startup wiring.
- No direct canon repository reads or writes.
- No release/save writes.
- No Web, Qdrant, Social Temp, lockfile, or root dependency changes.
- No real Redis, LLM, or ComfyUI service calls.

Contract:

- `V2CreateAssetGenerationJobApiRequest`
- `V2CreateAssetGenerationJobApiResponse`
- `V2AssetGenerationJobApiResponse`
- `V2AssetCandidateApiResponse`
- `V2ReviewAssetCandidateApiRequest`
- `V2ReviewAssetCandidateApiResponse`

Migration:

- None in this checkpoint.
- Reuses `0101_asset_generation_jobs` for asset jobs/candidates and `0102_asset_candidate_review` for review and approved asset facts.

State Machine:

- API creates asset jobs in `queued`.
- API cancel writes `cancelled` through `V2AssetGenerationJobRepository`.
- Asset candidates remain `pending` until review.
- Review reuses the shared asset candidate transitions:
  - `pending -> approved|rejected|changes_requested`
  - `changes_requested -> approved|rejected`
  - `approved` and `rejected` are terminal
- Approval writes approved asset facts through the AI-2 review repository only; it never modifies canon/release/save state.

Verification:

- `pnpm --filter @living-network/contracts typecheck`: exit 0
- `pnpm --filter @living-network/ports typecheck`: exit 0
- `pnpm --filter @living-network/api typecheck`: exit 0
- `pnpm --filter @living-network/api test`: exit 0
- `pnpm check:boundaries`: exit 0
- `pnpm typecheck`: exit 0
- `pnpm test`: exit 0
- `pnpm build`: exit 0
- `git diff --check`: exit 0

Known validation note:

- Initial direct `pnpm --filter @living-network/api test` run inside the sandbox failed with `spawn EPERM`; rerun with approved escalation passed.
- `git diff --check` reported only Git line-ending normalization warnings for the Windows checkout; no whitespace errors.

Fake Service Evidence:

- API tests use fake asset job, candidate, and review repositories injected into the generation plugin.
- Asset job create verifies idempotent replay, stable persisted job state, workflow version, seed, and cancel behavior.
- Asset candidate review verifies pending candidate reads, approval, review replay, and approved asset facts.
- Validation, missing job/candidate, and missing dependency responses are covered through Fastify injection.

External Services:

- Real Redis: not executed; API does not start a real queue or dispatch worker in this checkpoint.
- Real LLM: not executed; asset API only creates and reviews persisted facts.
- Real ComfyUI: not executed; API tests use fake repositories and no provider calls.
- Qdrant: not executed; Slice D optional scope.
