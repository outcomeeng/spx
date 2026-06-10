# Open Issues

## PDR-15 names only two layouts; the detector handles three

[`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) defines the main checkout for two layouts: a **single-tree layout** ("a non-bare repository with no linked worktrees") and a **bare-repository worktree pool**. The `isMainCheckout` / `mainCheckoutPath` detector in this node correctly handles a third layout PDR-15 does not name — a **non-bare repository *with* linked worktrees** (the layout `withGitWorktreeEnv` builds, and the one the session handoff-base L2 tests exercise). For that layout the main checkout is the main working tree (`dirname(git-common-dir)`), reached from any of its worktrees, and every linked worktree is not the main checkout.

The detector distinguishes a non-bare repository (main checkout = main working tree) from a bare pool (main checkout = the qualifying default-branch worktree) by `git config --get core.bare`, which reads `true` from every bare-pool worktree where `git rev-parse --is-bare-repository` reads `false`. This is a consistent extension of PDR-15's canonical-working-copy principle, not a contradiction.

**Impact:** PDR-15's two-layout framing reads as exhaustive while the implementation (correctly) covers three layouts. A reader reconciling PDR-15 against the code finds a layout the decision does not mention.

**Resolution condition:** revise [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md) through `/authoring` so the main-checkout definition covers a non-bare repository generally (its main working tree is the main checkout, with or without linked worktrees) alongside the bare-repository pool, and names `core.bare` as the signal that separates the two.
