# Known Issues

## The prior-form PLAN.md release line states a holder-only release authority

The `spx worktree release [--session-id <id>]` bullet in [`spx/38-worktree.enabler/PLAN.md`](PLAN.md) states that release "Frees the running worktree's claim only when the releasing session and controlling process match the current holder."

That sentence contradicts three Scenarios, which admit a release carrying an explicit session id as sufficient authority without a controlling-process match:

- the release-by-session-id Scenario in [`spx/38-worktree.enabler/43-worktree-cli.enabler/worktree-cli.md`](spx/38-worktree.enabler/43-worktree-cli.enabler/worktree-cli.md): a running claim recorded by session `S` with a live controlling process other than the caller's is removed by `spx worktree release --session-id S` without `SPX_WORKTREE_CONTROLLING_PID`
- the two release-by-session-id Scenarios in [`spx/38-worktree.enabler/32-occupancy-store.enabler/occupancy-store.md`](spx/38-worktree.enabler/32-occupancy-store.enabler/occupancy-store.md): a claim recording the supplied session id and a live process other than the caller's is removed, and a claim recording another session id remains unchanged with an ownership failure

**Impact:** a reader who loads the note as the node's release rule reads the narrower holder-only authority and mistakes the Scenarios for a violation.

**Settlement condition:** remove the line when the node's prior-form `PLAN.md` is migrated.
