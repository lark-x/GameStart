# V2 AI-1 Core Domain Runtime Delivery

Branch: `codex/v2-core-domain-runtime`

Base bootstrap SHA: `d1c00469b66b39d14417a0a6b36815a947a5ecc5`

## Checkpoint 1: Canon

Status: implemented on this branch

Implemented scope:

- Canon contracts for world, character, location, fact, rule, timeline event, snapshot, revisioned commands, and write responses.
- Domain rules for Canon construction, text trimming, enum validation, timeline local date shape, cross-world home location rejection, and stale revision error.
- Minimal AI-1 ports for `V2CanonRepository` and `V2CanonUnitOfWork`; no V1 `DomainRepositories` reuse.
- SQLite migration `0001_v2_core_canon` for V2 worlds, locations, characters, facts, FTS5 fact search, rules, timeline events, and canon idempotency.
- SQLite repository and transaction-backed unit of work with revision advance, idempotency replay, conflict detection, foreign keys, FTS trigger verification, rollback, and reopen recovery tests.
- Fastify core API routes under `/api/v2/core`:
  - `GET /worlds`
  - `POST /worlds`
  - `GET /worlds/:storyWorldId/canon`
  - `POST /worlds/:storyWorldId/locations`
  - `POST /worlds/:storyWorldId/characters`
  - `POST /worlds/:storyWorldId/facts`
  - `POST /worlds/:storyWorldId/rules`
  - `POST /worlds/:storyWorldId/timeline-events`

Explicit non-scope for this checkpoint:

- Graph, Typed State, Candidate Review, Release, Runtime, Export.
- LLM, ComfyUI, BullMQ worker, Redis, Qdrant, Web pages.
- V1 API compatibility or V1 data migration.

## Notes

- Canon writes require `expectedRevision` and `idempotencyKey`, except world creation which starts revision `1`.
- Same idempotency key with the same payload returns the original result. Same key with a different payload returns `409 IDEMPOTENCY_CONFLICT`.
- Stale revisions return `409 STALE_REVISION`.
- Missing world returns `404 NOT_FOUND`.
- Invalid request shape or unknown fields return `400 BAD_REQUEST`.
- Invalid cross-reference returns `422 VALIDATION_FAILED` at API level or SQLite constraint errors in the repository layer.

## Shared Entry Change

This checkpoint adds `coreOptions` to `createV2FastifyApp` so tests and runtime composition can pass the SQLite-backed core plugin dependencies through the Gate 0 Fastify composition root. This touches `apps/api/src/v2/platform/app.ts`, which Gate 0 marked as shared/frozen. It should be reviewed during integration as a shared entrypoint change, but it preserves the existing plugin hook and does not add business logic to platform.

## Validation

Validation commands and exit codes are reported in the handoff for the checkpoint commit.

## Checkpoint 2: Graph + Typed State

Status: implemented on this branch

Implemented scope:

- Graph contracts for Arc, Scene, Choice, Gate, Consequence, graph snapshot, graph validation diagnostics, and revisioned create commands.
- Typed State contracts for state variables, initial-state snapshots, state deltas, delta preview diagnostics, and revisioned state-variable create commands.
- Pure domain rules for:
  - Arc/Scene/Choice construction and text/id validation.
  - Cross-world graph reference rejection.
  - Choice gate and consequence scalar validation.
  - Graph validation with exactly-one-entry-scene errors, missing source/target errors, and unreachable scene warnings.
  - Typed State schema creation, initial state assembly, delta preview, `set`, numeric `increment`, and delta-indexed diagnostics.
- AI-1 ports for `V2GraphStateRepository` and `V2GraphStateUnitOfWork`, with Canon repository reused inside the same transaction for revision and idempotency.
- SQLite migration `0002_v2_core_graph_state` for V2 arcs, scenes, choices, and typed state variables.
- SQLite repository and transaction-backed unit of work for graph/state persistence, JSON scalar/array mapping, rollback, and cross-world foreign-key enforcement.
- Fastify core API routes under `/api/v2/core`:
  - `GET /worlds/:storyWorldId/graph`
  - `GET /worlds/:storyWorldId/graph/validation`
  - `POST /worlds/:storyWorldId/arcs`
  - `POST /worlds/:storyWorldId/scenes`
  - `POST /worlds/:storyWorldId/choices`
  - `GET /worlds/:storyWorldId/state/variables`
  - `POST /worlds/:storyWorldId/state/variables`
  - `GET /worlds/:storyWorldId/state/initial`
  - `POST /worlds/:storyWorldId/state/preview-delta`

Reusable content added for later AI-1 checkpoints:

- Choice `gates` and `consequences` share the same scalar state expression shape that Runtime can evaluate without changing graph storage.
- `previewV2TypedStateDelta` is deterministic and side-effect free, so Runtime can reuse it before applying player choices or validating Candidate Review effects.
- Graph validation returns structured diagnostics instead of throwing, so Release/Export can decide whether warnings block packaging.
- The GraphState unit of work deliberately includes Canon repository access, keeping optimistic concurrency and idempotency behavior consistent for all later core writes.

Explicit non-scope for this checkpoint:

- Runtime play sessions, saves, release packaging, export manifest generation, and Candidate Review workflows.
- LLM, ComfyUI, BullMQ worker, Redis, Qdrant, Web pages.
- State persistence for player saves; this checkpoint only defines schema and preview semantics.

## Checkpoint 3: Candidate Review + SQLite Core

Status: implemented on this branch

Implemented scope:

- Core-owned Candidate Review contracts for scene candidate submission, review action, review response, and review audit DTOs.
- Reused Gate 0 shared contract/domain content instead of redefining review vocabulary:
  - `V2CandidateEnvelope`
  - `V2SceneCandidatePayload`
  - `V2CandidateStatus`
  - shared `assertV2ReviewTransition`
  - shared `CandidateSubmissionPort`
- Pure domain rules for:
  - Scene candidate creation as `pending`.
  - Candidate provenance validation.
  - Scene payload id/text validation.
  - duplicate participant rejection.
  - review transition enforcement.
  - stale approval detection by `baseCanonRevision !== expectedRevision`.
  - deterministic scene-candidate apply plan.
- AI-1 ports for `V2CandidateReviewRepository` and `V2CandidateReviewUnitOfWork`.
- SQLite migration `0003_v2_core_candidate_review` for:
  - `v2_scene_candidates`
  - `v2_candidate_review_audits`
  - world/status and candidate/audit lookup indexes.
- SQLite implementation of shared `CandidateSubmissionPort`, backed by the AI-1 candidate table and canon idempotency records.
- Fastify core API routes under `/api/v2/core`:
  - `GET /worlds/:storyWorldId/candidates/scenes`
  - `POST /worlds/:storyWorldId/candidates/scenes`
  - `GET /worlds/:storyWorldId/candidates/scenes/:candidateId`
  - `POST /worlds/:storyWorldId/candidates/scenes/:candidateId/review`
  - `GET /worlds/:storyWorldId/candidates/scenes/:candidateId/audits`

Approval semantics:

- `approve` checks review transition and stale revision before applying graph writes.
- Approved scene candidates are applied atomically inside one SQLite transaction:
  - validate referenced location, participants, and target scenes.
  - create the proposed scene.
  - create deterministic candidate-owned choices.
  - advance world revision.
  - update candidate review state.
  - write review audit.
- `reject` and `request_changes` also advance revision, update review state, and write audit.
- Same idempotency key with the same review payload replays the original result; same key with a different payload returns `409 IDEMPOTENCY_CONFLICT` at API level.

Reusable content added for later AI-1/AI-2 checkpoints:

- `V2SqliteCandidateSubmissionPort` lets AI-2 submit pending scene candidates without reading AI-1 repositories or creating duplicate candidate tables.
- Candidate review audit rows provide a durable source for AI-3 Review UI and later export/release diagnostics.
- The apply plan creates deterministic choice IDs from candidate ID and choice index, making approval idempotent and reproducible.
- Stale candidate detection is centralized in core domain, so generation and UI clients do not need to duplicate revision rules.

Explicit non-scope for this checkpoint:

- Asset candidate approval. Asset review remains AI-2-owned and must not write canon.
- Release preflight/manifest, runtime play sessions, save/load, and export.
- LLM/ComfyUI/BullMQ/Qdrant/Web page implementation.

## Checkpoint 4: Release + Runtime + Export

Status: implemented on this branch

Implemented scope:

- Core-owned contracts for:
  - release manifest, preflight, and create-release command.
  - runtime run, current scene, choice submission, and save DTOs.
  - workspace/release export bundle with JSON and Markdown output.
- Pure domain rules for:
  - release graph preflight via existing graph diagnostics.
  - stable release content hash generation.
  - release version validation.
  - runtime start at the release entry scene.
  - runtime available-choice filtering by gates.
  - deterministic choice submission with typed-state consequences.
  - export Markdown rendering.
- SQLite migration `0004_v2_core_release_runtime` for:
  - `v2_releases`
  - `v2_runtime_runs`
  - `v2_runtime_saves`
- SQLite release/runtime repository and unit of work.
- Fastify core API routes under `/api/v2/core`:
  - `GET /worlds/:storyWorldId/releases`
  - `GET /worlds/:storyWorldId/releases/preflight`
  - `POST /worlds/:storyWorldId/releases`
  - `POST /runtime/runs`
  - `GET /runtime/runs/:runId/scene`
  - `POST /runtime/runs/:runId/choices`
  - `POST /runtime/runs/:runId/saves`
  - `GET /runtime/saves/:saveId`
  - `POST /runtime/saves/:saveId/load`
  - `GET /worlds/:storyWorldId/export?revision=...`
  - `GET /releases/:releaseId/export`

Release semantics:

- Release creation requires explicit `sourceRevision` and rejects stale workspace revisions.
- Release preflight blocks graph errors and allows warnings.
- Release manifest stores canon snapshot, full graph snapshot (`arcs`, `scenes`, `choices`), typed state schema, version, source revision, content hash, and creation time.
- Releases are immutable at repository/API level: no update route and no update repository method.

Runtime semantics:

- Runtime reads only release manifest plus run/save tables; it does not query workspace graph/canon/candidate/job tables after release lookup.
- Runtime start initializes typed state from release state schema and positions at the entry scene.
- Choice submission checks source scene, gates, target scene, applies typed-state consequences, records choice history, and updates the run.
- Save records release id/version, current scene, typed state, choice history, and created time.
- Save load creates a new run from the saved release id/version, scene, typed state, and choice history.

Export semantics:

- Workspace export requires an explicit revision and rejects stale revision mismatch.
- Release export reads immutable release manifest.
- Both exports return machine-readable JSON and human-readable Markdown.

Explicit non-scope for this checkpoint:

- Web UI implementation.
- Asset release validation against AI-2 approved asset facts.
