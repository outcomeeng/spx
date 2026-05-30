# Open Issues

## Archive command empty-result error-path coverage

- Source: re-scoped from `spx/36-session.enabler/43-session-store.enabler/ISSUES.md`, whose handoff/archive follow-up conflated nodes. `archiveCommand` and `SessionInvalidResultError` live in `src/commands/session/archive.ts` and are exercised by this node's tests, not by `43-session-store`.
- Evidence: no command-interface test exercises `spx session archive` rejecting an empty or absent `result` with `SessionInvalidResultError` through the public handler per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md).
- Impact: the `SessionInvalidResultError` diagnostic can drift from its command-visible message without a public workflow test catching the mismatch.
- Resolution: add command-interface scenario coverage for `archiveCommand` rejecting an empty or absent `result` before the next session error-handling change.
