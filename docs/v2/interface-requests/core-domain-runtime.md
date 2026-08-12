# V2 AI-1 Core Domain Runtime Interface Requests

Branch: `codex/v2-core-domain-runtime`

## Requests

### core-options-on-fastify-composition-root

- Severity: integration
- Owner requested: integration maintainer
- File touched: `apps/api/src/v2/platform/app.ts`
- Reason: Gate 0 froze the Fastify composition root but only exposed plugin replacement, not per-plugin runtime options. AI-1 needs to pass SQLite-backed core dependencies into the existing core plugin without replacing the plugin entirely in every runtime/test.
- Implemented proposal: add optional `coreOptions?: Record<string, unknown>` to `createV2FastifyApp` and spread it into the core plugin registration.
- Compatibility: existing calls without `coreOptions` behave the same; `/api/v2/health` remains unchanged.

No blocking requests are open for the Canon checkpoint.

## Checkpoint 2 Notes

Graph + Typed State did not require additional shared-path changes beyond the previously listed `coreOptions` composition-root hook.

The new SQLite migration is registered through AI-1-owned `packages/database/src/v2/core/migrations.ts`; the existing platform migration registry already imports the core migration list and did not need another shared edit.

No blocking interface requests are open for the Graph + Typed State checkpoint.

## Checkpoint 3 Notes

Candidate Review + SQLite Core did not require shared contract changes. It reuses the Gate 0 shared candidate envelope, scene candidate payload, candidate status, review transition helper, and `CandidateSubmissionPort`.

The implementation adds a core-owned SQLite implementation of `CandidateSubmissionPort` so AI-2 can submit scene candidates through the frozen shared port without direct access to AI-1 repositories.

No blocking interface requests are open for the Candidate Review + SQLite Core checkpoint.
