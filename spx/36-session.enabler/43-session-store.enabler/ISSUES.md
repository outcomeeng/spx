# Open Issues

## Handoff and archive command error-path coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496092724
- Evidence: `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts` covers successful `handoffCommand` git context through `HANDOFF_GIT_DEPS`, while the command-interface failure paths for git context and empty archive `result` are not covered through the public command handlers.
- Impact: error classes can drift from their command-visible diagnostics without a public workflow test catching the mismatch.
- Resolution: add command-interface scenario coverage for `detectSessionWorkContext` failure paths and `SessionInvalidResultError` before the next session error-handling change.
