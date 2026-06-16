# Worktree CLI Issues

## Duplicate Resolved Status Targets

`spx worktree status` can receive more than one path argument that resolves to the same worktree root, such as the root path and a file path inside it. The current multi-target behavior reports one occupancy record per resolving argument, so duplicate resolved roots can produce duplicate records.

Revisit when specifying duplicate-target semantics for multi-target status. Decide whether `status [worktree...]` preserves one output per input argument or de-duplicates after git worktree-root resolution while preserving first-seen order.

Evidence: GitHub PR #193 review comment on `spx/38-worktree.enabler/43-worktree-cli.enabler`.
