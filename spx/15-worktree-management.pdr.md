# Worktree Management

spx operates across the worktrees of one repository on two axes. Each subcommand resolves its root directory from the class of state it touches: shared gitignored state under `.spx/` resolves to the Git common-dir product root so every worktree sees one copy, while per-worktree gitignored state under `.spx/local/` and the tracked `spx/` spec tree both resolve to the local worktree root so each branch's working copy carries its own. Across those worktrees, at most one is the **main checkout** — the canonical working copy. A single-tree layout — a non-bare repository with no linked worktrees — has one working tree, and that lone tree is the main checkout on whatever branch it holds. A bare-repository worktree pool designates the main checkout as the worktree that has the repository's default branch (`origin/HEAD`) checked out, whose directory name is exactly that default branch name, and that is a sibling of the bare repository; a pool with no worktree meeting all three conditions has no main checkout.

| State class                              | Root resolution             | Git mechanism                              |
| ---------------------------------------- | --------------------------- | ------------------------------------------ |
| `.spx/` (gitignored, shared)             | Git common-dir product root | Parent of `git rev-parse --git-common-dir` |
| `.spx/local/` (gitignored, per-worktree) | Local worktree root         | `git rev-parse --show-toplevel`            |
| `spx/` (tracked)                         | Local worktree root         | `git rev-parse --show-toplevel`            |

## Rationale

Git worktrees share one Git common directory while each keeps its own working copy of tracked files. The three state classes follow that split. Session state exists once per repository and must be reachable from any worktree, so it resolves to the Git common-dir product root every worktree shares. The tracked `spx/` spec tree varies per branch, so it resolves to the worktree's own working copy. Per-worktree local state — test-run evidence — describes one working copy's current state, so resolving it to the worktree root keeps each branch's evidence with that branch and lets the evidence be discarded with the worktree, instead of accumulating branch-slugged directories under the shared root.

Resolving every directory to a single root fails one class or another: a single common-dir root reads the wrong branch's spec tree from sibling worktrees; a single worktree root strands session state where no other worktree can see it.

One worktree is canonical because a single working copy backs the repository's shipped artifacts and its session continuity. A single-tree layout has one working tree, so it is unambiguously canonical whatever branch it holds. In a pool the designation rests on three signals git already holds — the default branch, the directory name, and sibling placement beside the bare repository — because any one alone can mislead: a recorded tool path goes stale when the layout moves, a directory merely named for the default branch need not have it checked out, and the default branch checked out in an unrelated pool worktree is a mistake rather than a second main checkout. Requiring all three to agree resolves a pool misconfiguration to no main checkout rather than the wrong one.

## Product properties

- `spx session` commands read and write the same `.spx/sessions/` directory from every worktree of the repository.
- `spx validation` and spec-tree commands operate on the current worktree's tracked `spx/` files, and a worktree's `.spx/local/` state is private to that worktree.
- At most one worktree of a repository is the main checkout: the lone tree of a single-tree layout, or the qualifying default-branch worktree of a pool; a pool satisfying none of the three conditions has none.

## Verification

### Testing

- ALWAYS: in a single-tree layout — a non-bare repository whose only working tree is its root — that lone working tree is the main checkout, whatever branch it has checked out ([test])
- ALWAYS: in a bare-repository worktree pool, a worktree is the main checkout exactly when its checked-out branch equals `origin/HEAD`'s target, its directory basename equals that branch name, and it sits beside the bare repository (`dirname(git-common-dir)` equals the worktree root's parent); a pool with no such worktree has no main checkout ([test])

### Audit

- ALWAYS: resolve `.spx/` shared state to the Git common-dir product root — the parent of `git rev-parse --git-common-dir` ([audit])
- ALWAYS: resolve `.spx/local/` per-worktree state and tracked `spx/` files to the local worktree root via `git rev-parse --show-toplevel` ([audit])
- ALWAYS: keep root-resolution helper names aligned with the `spx/16-config.enabler/65-product-directory-api.enabler/` product-directory vocabulary ([audit])
- ALWAYS: fall back to the current working directory with a warning when the command runs outside a git repository ([audit])
- NEVER: resolve `.spx/` shared state to `git rev-parse --show-toplevel` — it strands session state no other worktree can see ([audit])
- NEVER: resolve `.spx/local/` per-worktree state to the Git common-dir product root — it leaks one branch's evidence into every worktree ([audit])
- NEVER: derive the main checkout or any worktree classification from a recorded tool path, a `.git` file-versus-directory test, or any signal other than git plumbing — the default branch, the directory name, and the common-dir relationship ([audit])
