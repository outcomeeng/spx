# PLAN: Worktree Occupancy

## Harness vocabulary guard

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, configured agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Index horizon

Children occupy the first-half grid slots `[10, 50]` — `21-occupancy-claim.adr.md`, `32-occupancy-store.enabler`, `43-worktree-cli.enabler`. The second-half grid slots `54, 65, 76, 87, 98` are reserved for future occupancy children (for example, a split of liveness from claim-record storage, or a status cache).

## Integration contract

Plugin SessionStart hooks delegate startup behavior to `spx hook run session-start`; `/handoff`, `/pickup`, and manual repair flows invoke `spx worktree`:

- `spx worktree claim --session-id <id>` — invoked by manual repair and compatibility flows with the working directory in the worktree being claimed. Fast; writes nothing to stdout; exits 0 on success.
- `spx worktree status <pool-worktree>` — invoked by `/pickup` before checking a work branch out into a pool worktree. Reports `running` or `free` through a parseable shape (`--format json`). `/pickup` enters only a `free` worktree.
- `spx worktree release` — invoked by `/handoff` at session close. Frees the running worktree's claim. Best-effort: a missing command, non-zero exit, or slow release is harmless because a dead holder's claim already reads as `free` at the next status check.

The plugin-side integration design is governed in `github.com/outcomeeng/plugins` at `spx/21-spec-tree.enabler/19-worktree-occupancy.enabler/` and `spx/21-spec-tree.enabler/76-sessions.enabler/ISSUES.md`.

## Harness vocabulary alignment

`spx/12-agent-harness.pdr.md` distinguishes configured agents from agent sessions. Align `spx/15-worktree-management.pdr.md`, worktree occupancy specs, command text, and claim records so the worktree holder vocabulary names the holder session identity the claim records, rather than treating the worktree claim itself as an agent.

## Harness governance

`testing/harnesses/worktree/harness.ts`'s recording `OccupancyFileSystem` double is governed by `spx/38-worktree.enabler/32-occupancy-store.enabler/21-test-harness.enabler` (the harness file reaches 100% statement coverage; its probes, process table, CLI runner, and pool-env builders are consumer-covered). The `worktree` generator is fully consumer-covered (no node). `testing/harnesses/worktree-layout/worktree-layout.ts` is a cross-cutting provisioner (6 consumer nodes) deferred to the infrastructure batch in `spx/21-infrastructure.enabler/PLAN.md`.
