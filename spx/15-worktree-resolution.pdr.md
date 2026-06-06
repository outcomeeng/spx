# Worktree Resolution

Each spx subcommand resolves its root directory from the class of state it operates on. Shared gitignored state under `.spx/` resolves to the Git common-dir product root so every worktree sees one copy; per-worktree gitignored state under `.spx/local/` and the tracked `spx/` spec tree both resolve to the local worktree root so each branch's working copy carries its own.

| State class                              | Root resolution             | Git mechanism                              |
| ---------------------------------------- | --------------------------- | ------------------------------------------ |
| `.spx/` (gitignored, shared)             | Git common-dir product root | Parent of `git rev-parse --git-common-dir` |
| `.spx/local/` (gitignored, per-worktree) | Local worktree root         | `git rev-parse --show-toplevel`            |
| `spx/` (tracked)                         | Local worktree root         | `git rev-parse --show-toplevel`            |

## Rationale

Git worktrees share one Git common directory while each keeps its own working copy of tracked files. The three state classes follow that split. Session state exists once per repository and must be reachable from any worktree, so it resolves to the Git common-dir product root every worktree shares. The tracked `spx/` spec tree varies per branch, so it resolves to the worktree's own working copy. Per-worktree local state — test-run evidence — describes one working copy's current state, so resolving it to the worktree root keeps each branch's evidence with that branch and lets the evidence be discarded with the worktree, instead of accumulating branch-slugged directories under the shared root.

Resolving every directory to a single root fails one class or another: a single common-dir root reads the wrong branch's spec tree from sibling worktrees; a single worktree root strands session state where no other worktree can see it.

## Product properties

- `spx session` commands read and write the same `.spx/sessions/` directory from every worktree of the repository.
- `spx validation` and spec-tree commands operate on the current worktree's tracked `spx/` files.
- A worktree's `.spx/local/` state is private to that worktree; no worktree reads another worktree's `.spx/local/` state.

## Verification

### Audit

- ALWAYS: resolve `.spx/` shared state to the Git common-dir product root — the parent of `git rev-parse --git-common-dir` ([audit])
- ALWAYS: resolve `.spx/local/` per-worktree state and tracked `spx/` files to the local worktree root via `git rev-parse --show-toplevel` ([audit])
- ALWAYS: keep root-resolution helper names aligned with the `spx/16-config.enabler/65-product-directory-api.enabler/` product-directory vocabulary ([audit])
- ALWAYS: fall back to the current working directory with a warning when the command runs outside a git repository ([audit])
- NEVER: resolve `.spx/` shared state to `git rev-parse --show-toplevel` — it strands session state no other worktree can see ([audit])
- NEVER: resolve `.spx/local/` per-worktree state to the Git common-dir product root — it leaks one branch's evidence into every worktree ([audit])
- NEVER: hardcode worktree-detection heuristics such as testing for a `.git` file versus directory — use git plumbing commands ([audit])
