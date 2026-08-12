# V2 Web Product Interface Requests

## IR-WEB-001: Workspace Snapshot Endpoints

Severity: `integration`

Checkpoint: V2 App Shell + typed adapters

Current Web proposal:

- `GET /api/v2/health` is used as the only live HTTP endpoint in the first shell checkpoint.
- Canon, scene graph, candidate, release preflight, and run summaries are fixture-backed in Mock mode and in the Http adapter after health succeeds.

Requested integration surface:

- Stable read endpoints or a single workspace summary endpoint that can provide:
  - active story world ID, name, and revision
  - scene graph entry scene and scene summaries
  - candidate summary for pending review
  - release preflight summary
  - current run/save preview summary

Reason:

- AI-3 can keep page state and adapter boundaries stable with fixtures, but replacing Mock with Http should not require rewriting page state.

## IR-WEB-002: Canon, Graph, and Typed State Preview Contracts

Severity: `integration`

Checkpoint: Canon + Graph + Typed State

Current Web proposal:

- Canon summary includes world premise, character/location/fact/rule summaries, and an expected revision draft preview.
- Graph summary includes scene reachability, choice counts, state delta preview counts, and diagnostics.
- Typed State summary includes schema revision, variables, and scene delta previews.

Requested integration surface:

- Read endpoints or snapshot fields for Canon/Graph/Typed State summaries.
- A preview endpoint for Canon edits that accepts `expectedRevision` and returns either a revised snapshot or a stale revision conflict.
- Stable diagnostic severity values aligned with Badge tones: `info`, `warning`, `danger`.

Reason:

- The Web can show conflict and graph/state validation flows with fixtures, but integration needs authoritative backend validation and revision conflict semantics.
