---
name: sol-luna
description: Run a Sol-led development workflow with bounded Luna exploration, implementation, and verification plus a gated Sol High escalation path. Use when the user invokes $sol-luna or asks Sol to plan, delegate, review, and accept a code or configuration change with explicit evidence and rollback boundaries.
---

# Sol–Luna workflow

Keep ownership of requirements, decisions, risks, review, and final acceptance in the primary Sol thread. Delegate mechanical or evidence-heavy work only after its boundaries are explicit.

## Workflow

1. Inspect the request, repository state, applicable `AGENTS.md`, configuration, permissions, and rollback constraints. Clarify only decisions that materially change scope or risk.
2. Decide whether evidence is missing. If so, send `luna_explorer` one or more independent read-only contracts. Parallelize only non-overlapping reads.
3. Choose the design in Sol. Do not ask Luna to make a major architecture decision.
4. Split implementation into the smallest independently testable, reversible units. Serialize edits to the same file or code region.
5. Send each unit to `luna_implementer` with the complete contract below. Never send an open-ended request.
6. Send bounded verification to `luna_tester` when independent testing, reproduction, build output, or log analysis adds value.
7. Wait for structured results. Inspect the actual diff or files and completed command results. A Luna completion never implies acceptance.
8. Request narrowly scoped rework or additional tests when evidence is insufficient. Preserve the same boundaries unless Sol explicitly revises the plan.
9. Route to `sol_escalation` only when a High trigger below is documented. Otherwise keep the decision in Sol Medium.
10. Finish with accepted changes, validation evidence, unresolved limitations, risks, and rollback instructions.

## Delegation contract

Include every field:

1. **Objective:** the one outcome required now.
2. **Allowed scope:** exact readable and writable paths.
3. **Forbidden scope:** files, systems, dependencies, or behaviors that must not change.
4. **Known context:** relevant call chain, constraints, and accepted prior conclusions.
5. **Completion criteria:** observable conditions for completion.
6. **Validation:** exact builds, tests, checks, or evidence required.
7. **Rollback:** exact way to restore the pre-task state.
8. **Return format:** investigation conclusion; modified files; key code changes; commands executed; test results; unresolved questions; risks and recommendations.

If a task cannot be made explicit, testable, and reversible, keep it with Sol until those conditions exist.

## High escalation gate

Use `sol_escalation` only for at least one of:

- cross-subsystem architecture decisions;
- data migrations, protocol changes, or irreversible operations;
- security, permissions, concurrency, race, or data-consistency risks;
- alternatives with material long-term cost or major tradeoffs;
- two unsuccessful Sol Medium attempts to reach a credible conclusion;
- credible risk of production failure, data damage, or large-scale rework from a wrong decision.

Do not escalate ordinary features, formatting, routine tests, simple bugs, code search, or documentation. If the user temporarily disables High, do not invoke it; report any qualified escalation need as a blocker for Sol to resolve.

## Acceptance checklist

- The result stays within the authorized scope.
- Sol inspected actual file changes or verified that the task was read-only.
- Required commands finished, with pass/fail evidence and exit status.
- No unrelated file, dependency, permission, MCP, hook, or configuration changed.
- Rollback remains clear and feasible.
- Remaining uncertainty and unverified behavior are stated explicitly.
