# Open Issues

## Handoff command-interface error-path coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496092724
- Follow-up review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496917494
- Evidence: `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts` covers successful `handoffCommand` git context through `HANDOFF_GIT_DEPS`, but the command-interface failure path for `detectSessionWorkContext` is not covered through the public handler. The empty-`result` archive path is re-scoped to `spx/36-session.enabler/54-session-retention.enabler/ISSUES.md`, where `archiveCommand` and `SessionInvalidResultError` live.
- Design decision — validation-vs-git ordering: `handoffCommand` runs `detectSessionWorkContext` before validating `goal` / `next_step`, so when both fail (for example a detached HEAD plus an omitted `goal`) the git error surfaces first and masks the actionable input error. Settle whether to assert the current git-first ordering or reorder input validation ahead of git detection before writing the scenario; the test pins whichever ordering the decision selects.
- Impact: error classes can drift from their command-visible diagnostics without a public workflow test catching the mismatch.
- Resolution: settle the ordering decision, then add command-interface scenario coverage for the `detectSessionWorkContext` failure path and validation-vs-git ordering for missing `goal` / `next_step`.

## Frontmatter key rule ubiquitous-token false-positive coverage

- Review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4499642506
- Evidence: `eslint-rules/no-hardcoded-session-frontmatter-keys.ts` monitors frontmatter key literals including `id`, `branch`, `result`, and `files`, while the compliance fixtures do not include non-frontmatter uses of those common strings in session-scoped files.
- Impact: future edits can make the rule noisy by flagging ordinary identifier-like strings as frontmatter violations, or weaken the rule while preserving only the existing happy-path fixtures.
- Resolution: add compliance fixture coverage for monitored ubiquitous tokens used outside frontmatter-key call sites before changing the frontmatter-key rule again.

## Specs/files scenario assertions overlap the property assertion

- Review: `spec-tree:reviewing-changes` on `work/session-store-coverage` — F-001 (consistency, follow_up)
- Evidence: `spx/36-session.enabler/43-session-store.enabler/session-store.md` declares four named scenarios for the `specs` / `files` arrays with YAML-significant characters (`>`, `|`, `{`) and a single empty-string entry. The `arbitraryHandoffHeader` property assertion already proves round-trip fidelity for arbitrary unicode-string arrays, so the four scenarios are subsumed by it — they add named debug-pinpoint witnesses, not coverage breadth.
- Impact: a reader scanning the Scenarios block may infer the property test is narrower than it is, and a future author adding more YAML-sensitive characters may reach for more scenarios rather than trusting the property.
- Resolution: decide whether to replace the four scenario assertions with a cross-reference on the property assertion that names the YAML characters it exercises, or retain them as explicit regression anchors with a note on the property pointing at the named scenarios.
