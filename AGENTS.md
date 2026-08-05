# Sol–Luna project rules

- Keep requirements, decisions, risk judgments, and the final result in the primary Sol thread.
- Put search output, test logs, and intermediate exploration in bounded subagent threads whenever practical.
- Parallelize only independent read-heavy exploration, tests, retrieval, or log analysis.
- Serialize tasks that modify the same file or code region. Without separate worktrees, never let multiple subagents edit overlapping code.
- A Luna completion is evidence, not acceptance. Sol must inspect the changed files, scope, and completed test results before accepting work.
- A test command starting is not a passing test. Report the exit status and assertion/result evidence.
- Support important conclusions with files, symbols, commands, or test evidence; do not report conclusions alone.
- Keep changes minimal. Do not refactor unrelated code or add dependencies as a side effect.
- Every delegation must provide objective, allowed scope, forbidden scope, known context, completion criteria, validation, rollback, and the required structured return format.
- Use `sol_escalation` only when a documented High trigger is present. Ordinary implementation, search, formatting, tests, simple bugs, and documentation stay with Sol Medium and Luna.
