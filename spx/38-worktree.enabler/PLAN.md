# PLAN: Worktree Occupancy

## Index horizon

Children occupy the first-half grid slots `[10, 50]` — `21-occupancy-claim.adr.md`, `32-occupancy-store.enabler`, `43-worktree-cli.enabler`. The second-half grid slots `54, 65, 76, 87, 98` are reserved for future occupancy children (for example, a split of liveness from claim-record storage, or a status cache).

## Integration contract (settled — do not re-derive)

The marketplace half is merged and live (outcomeeng/plugins, spec-tree 0.57.23). The SessionStart hook and the `/handoff` and `/pickup` skills invoke `spx worktree`:

- `spx worktree claim --session-id <id>` — invoked by the SessionStart hook with the working directory in the worktree being claimed. Bounded by the hook's claim timeout; absent CLI, non-zero exit, and timeout are all a silent no-op. Fast; writes nothing to stdout; exits 0 on success.
- `spx worktree status <pool-worktree>` — invoked by `/pickup` before checking a work branch out into a pool worktree. Reports occupied, unclaimed, or stale through a parseable shape (`--format json`). `/pickup` enters only an unclaimed-or-stale worktree.
- `spx worktree release` — invoked by `/handoff` at session close. Frees the running worktree's claim. Best-effort: a missing command, non-zero exit, or slow release is harmless because a dead holder's claim already reads as stale at the next status check.

The authoritative design lives on `origin/main` of `github.com/outcomeeng/plugins` at `spx/21-spec-tree.enabler/19-worktree-occupancy.enabler/` and `spx/21-spec-tree.enabler/76-sessions.enabler/ISSUES.md`.
