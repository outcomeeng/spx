# PLAN: Worktree Occupancy

## Index horizon

Children occupy the first-half grid slots `[10, 50]` — `21-occupancy-claim.adr.md`, `32-occupancy-store.enabler`, `43-worktree-cli.enabler`. The second-half grid slots `54, 65, 76, 87, 98` are reserved for future occupancy children (for example, a split of liveness from claim-record storage, or a status cache).

## Remaining work

### Durable decisions (same change)

- Author `spx/38-worktree.enabler/21-occupancy-claim.adr.md` — the write-once PID claim plus on-demand `kill -0` liveness with no heartbeat and no TTL, and the PID-reuse guard comparing the claim's start time (and/or boot id) against the process table. Run the ADR audit gate.
- Amend `spx/15-worktree-management.pdr.md` — add `.spx/worktrees/` as a Git common-dir (shared) state class: a state-class table row, a product property, and verification rules, so every worktree of the repository reads the same claims. Run the PDR audit gate.
- Amend `spx/18-state.enabler/32-scope-addressing.enabler/scope-addressing.md` — add the `.spx/worktrees/` shared scope alongside branch, worktree, and sessions, with its assertion. This is the same-change lower-spec alignment for the PDR amendment.

### Implementation (TDD via `/applying`)

Apply in dependency order — provider before consumer:

1. `spx/38-worktree.enabler/32-occupancy-store.enabler` — claim-record I/O over the injected filesystem and the on-demand liveness check over an injected process probe, addressing `.spx/worktrees/` through the state scope-addressing API. Domain logic in `src/domains/worktree/`.
2. `spx/38-worktree.enabler/43-worktree-cli.enabler` — Commander bindings in `src/commands/worktree/` and the registration descriptor `src/interfaces/cli/worktree.ts`, registered through the static descriptor registry per `spx/14-cli-composition.adr.md`.

Each node runs the architecture, test-evidence, and code audit gates per `/spec-tree:applying`.

## Integration contract (settled — do not re-derive)

The marketplace half is merged and live (outcomeeng/plugins, spec-tree 0.57.23). The SessionStart hook and the `/handoff` and `/pickup` skills already invoke `spx worktree` and degrade silently until these subcommands ship:

- `spx worktree claim --session-id <id>` — invoked by the SessionStart hook with the working directory in the worktree being claimed. Bounded by the hook's claim timeout; absent CLI, non-zero exit, and timeout are all a silent no-op. Fast; writes nothing to stdout; exits 0 on success.
- `spx worktree status <pool-worktree>` — invoked by `/pickup` before checking a work branch out into a pool worktree. Reports occupied, unclaimed, or stale through a parseable shape (`--format json`). `/pickup` enters only an unclaimed-or-stale worktree.
- `spx worktree release` — invoked by `/handoff` at session close. Frees the running worktree's claim. Best-effort: a missing command, non-zero exit, or slow release is harmless because a dead holder's claim already reads as stale at the next status check.

The authoritative design lives on `origin/main` of `~/Code/outcomeeng/plugins/` at `spx/21-spec-tree.enabler/19-worktree-occupancy.enabler/` and `spx/21-spec-tree.enabler/76-sessions.enabler/ISSUES.md`.
