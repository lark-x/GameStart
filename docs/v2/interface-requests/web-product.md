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
