# Plan: Resume

## Deferred discovery capabilities (later slice)

The current spec scopes discovery to the current worktree and to a session's
**initial** recorded branch. A later slice extends discovery without reopening
the bounded-read design:

- `--pr <n>` — resolve a pull request to its head branch via `gh` (network), then
  apply branch scope. Online-gated: fails with a clear diagnostic when offline or
  `gh` is absent, so the worktree and branch scopes stay offline-first per
  `spx/spx.product.md`.
- Freestyle "branch or PR anywhere in the session" search — match a branch or PR
  reference that appears at any point in a transcript, not only the initial
  recorded branch. This requires a full scan and so is opt-in, kept off the fast
  default path.
- Codex "all branches visited" — reconstruct every branch a Codex session touched
  (the `session_meta` row records only the branch at session start).

## Harness vocabulary

Reconcile this node against `spx/12-agent-harness.pdr.md` alongside its parent
`spx/46-agent.enabler`: keep the spec, command text, and launch vocabulary on
coding-agent **session** coordination, distinct from the SPX handoff sessions
under `spx/36-session.enabler` and from the harness that manages agent
configuration.
