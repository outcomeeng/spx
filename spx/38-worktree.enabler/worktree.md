# Worktree Occupancy

PROVIDES the `spx worktree` command family — a write-once per-agent worktree claim and an on-demand process-liveness check over `.spx/worktrees/<name>.claim`
SO THAT the SessionStart hook, `/handoff`, `/pickup`, and any flow that enters a bare-repository pool worktree
CAN distinguish a worktree a live agent holds from a free one instead of inferring occupancy from git cleanliness

## Assertions

### Compliance

- ALWAYS: every read, write, or removal of a `.spx/worktrees/` claim is performed by the `spx` CLI invoked as `spx worktree`; the SessionStart hook and the `/handoff` and `/pickup` skills reach claim state only through that subprocess, never by direct filesystem access ([audit])
- ALWAYS: occupancy is decided by on-demand process liveness, not by git state and not by a refresh timer — a clean worktree detached at the default-branch tip is never inferred free without reading its claim, per [`spx/38-worktree.enabler/21-occupancy-claim.adr.md`](21-occupancy-claim.adr.md) ([audit])
- NEVER: a `spx worktree` operation reads, writes, or removes a claim outside the invoking worktree's own `.spx/` pool — the claim protocol coordinates only agents that share one pool, so a foreign pool's worktree is out of scope ([audit])
