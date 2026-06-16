# Open Issues

## Worktree claim has no atomic check-and-claim (TOCTOU)

`spx worktree claim` writes the running worktree's claim unconditionally — `writeClaim` renames a temp file onto the claim path, atomic for the write but not a check-and-claim. In the marketplace `/pickup` flow, two agents that read `spx worktree status` as unclaimed at the same instant can both enter the worktree and both invoke `claim`; the second write overwrites the first, leaving both agents operating in the worktree with neither aware.

**Impact:** A narrow TOCTOU window in the check-then-enter path. The settled design is a write-once PID claim (`spx/21-spec-tree.enabler/19-worktree-occupancy.enabler` on `github.com/outcomeeng/plugins`), which does not specify atomic check-and-claim; closing the window requires `O_EXCL` fail-if-exists creation or advisory file locking — a more invasive design than the write-once model this node implements.

**Resolution:** Decide whether the write-once model accepts this residual race or adopts an atomic check-and-claim (`O_EXCL` or advisory lock). If adopted, amend `spx/38-worktree.enabler/21-occupancy-claim.adr.md` and `spx/38-worktree.enabler/32-occupancy-store.enabler/occupancy-store.md` and reconcile with the marketplace settled design before implementing.
