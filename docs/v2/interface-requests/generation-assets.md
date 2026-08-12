# AI-2 Interface Requests: Generation Assets

## REQ-generation-assets-001: Make package AI V2 tests discoverable by package script

- Status: resolved on `codex/v2-integration`
- Severity: integration
- Needed by: AI-2 Slice B Provider + Generation Context and later provider extensions
- Owner of affected contract/module: Gate 0 / shared package scripts
- Current contract or behavior: `packages/ai/package.json` uses `node --test src/*.test.ts`, which discovers root-level test files but not future `packages/ai/src/v2/**/*.test.ts` files.
- Proposed contract or behavior: Change `@living-network/ai` test script to use the Gate 0 recursive test discovery script, for example `node ../../scripts/run-tests.mjs src`, matching API/Worker/Contracts/Domain/Database.
- Producers affected: AI-2 provider extension tests in `packages/ai`.
- Consumers affected: CI, local verification, final integration validation.
- Failure/error semantics: Without the change, `pnpm --filter @living-network/ai test` can exit 0 while missing nested V2 AI tests, contradicting the Gate 0 sentinel/discovery requirement.
- Fixture/test changes: Existing root-level AI tests should remain discovered; nested V2 provider tests should also be discovered.
- Reason: Root package scripts and Gate 0 test scripts are frozen for business branches, so AI-2 should not modify this directly.
- Compatibility and migration impact: Additive test discovery behavior; no runtime API impact.
- Decision and integration commit: accepted; `@living-network/ai` now uses `scripts/run-tests.mjs`, and both root-level and V2 nested tests are discovered.
