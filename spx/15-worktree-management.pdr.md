# Worktree Management

spx operates across the worktrees of one repository on two axes. Each subcommand resolves its root directory from the class of state it touches: shared gitignored state under `.spx/` resolves to the Git common-dir product root so every worktree sees one copy, while per-worktree gitignored state under `.spx/local/` and the tracked `spx/` spec tree both resolve to the local worktree root so each branch's working copy carries its own. Across those worktrees, at most one is the **main checkout** — the canonical working copy. A non-bare repository, with or without linked worktrees, has its main checkout at its main working tree — the parent of the Git common directory — reached from any of its worktrees. A bare-repository worktree pool designates the main checkout as the worktree that sits beside the bare repository and whose directory name is the repository's name taken from the `origin` remote; a pool with no such worktree has no main checkout, though the path one would occupy stays derivable from that repository name. `git config --get core.bare` separates the two layouts, and the designation is independent of which branch any worktree has checked out.

| State class                              | Root resolution             | Git mechanism                              |
| ---------------------------------------- | --------------------------- | ------------------------------------------ |
| `.spx/` (gitignored, shared)             | Git common-dir product root | Parent of `git rev-parse --git-common-dir` |
| `.spx/local/` (gitignored, per-worktree) | Local worktree root         | `git rev-parse --show-toplevel`            |
| `spx/` (tracked)                         | Local worktree root         | `git rev-parse --show-toplevel`            |

## Rationale

Git worktrees share one Git common directory while each keeps its own working copy of tracked files. The three state classes follow that split. Session state exists once per repository and must be reachable from any worktree, so it resolves to the Git common-dir product root every worktree shares. The tracked `spx/` spec tree varies per branch, so it resolves to the worktree's own working copy. Per-worktree local state — test-run evidence — describes one working copy's current state, so resolving it to the worktree root keeps each branch's evidence with that branch and lets the evidence be discarded with the worktree, instead of accumulating branch-slugged directories under the shared root.

Resolving every directory to a single root fails one class or another: a single common-dir root reads the wrong branch's spec tree from sibling worktrees; a single worktree root strands session state where no other worktree can see it.

One worktree is canonical because a single working copy backs the repository's shipped artifacts and its session continuity. A non-bare repository has one main working tree, canonical whether or not linked worktrees join it. In a pool the canonical worktree is the one beside the bare repository whose directory name is the repository's own — the `origin` remote's repository name — because naming it after the default branch instead puts every repository's main checkout in a directory named for that branch, so a developer working across repositories sees the same directory and window name everywhere; the repository name gives each a distinct `project/project` location while staying a value git already holds. The designation ignores the checked-out branch: the canonical worktree is identified by placement and name alone, so it stays the main checkout — and shared session state stays reachable through it — even while it sits briefly off the default branch to repair that branch, which a branch-match requirement would turn into a spurious session-write refusal for no benefit. Sibling placement and the repository-name match designate at most one worktree, so a pool missing it resolves to no main checkout rather than the wrong one.

## Product properties

- `spx session` commands read and write the same `.spx/sessions/` directory from every worktree of the repository.
- `spx validation` and spec-tree commands operate on the current worktree's tracked `spx/` files, and a worktree's `.spx/local/` state is private to that worktree.
- At most one worktree of a repository is the main checkout: a non-bare repository's main working tree, or the pool worktree beside the bare repository whose directory name is the `origin` remote's repository name; a pool without that worktree has none — no worktree is the main checkout — even though the path it would occupy stays derivable from the repository name, so a diagnostic can still name where it belongs. The designation does not depend on the branch any worktree has checked out.

## Verification

### Testing

- ALWAYS: in a non-bare repository — with or without linked worktrees — the main checkout is the main working tree, the parent of the Git common directory, reachable from any worktree and independent of the branch checked out ([mapping])
- ALWAYS: in a bare-repository worktree pool, a worktree is the main checkout exactly when it sits beside the bare repository (`dirname(git-common-dir)` equals the worktree root's parent) and its directory basename equals the `origin` remote's repository name; a pool with no such worktree has no main checkout, whatever branch any worktree holds ([mapping])

### Audit

- ALWAYS: resolve `.spx/` shared state to the Git common-dir product root — the parent of `git rev-parse --git-common-dir` ([audit])
- ALWAYS: resolve `.spx/local/` per-worktree state and tracked `spx/` files to the local worktree root via `git rev-parse --show-toplevel` ([audit])
- ALWAYS: keep root-resolution helper names aligned with the `spx/16-config.enabler/65-product-directory-api.enabler/` product-directory vocabulary ([audit])
- ALWAYS: fall back to the current working directory with a warning when the command runs outside a git repository ([audit])
- ALWAYS: separate a non-bare repository from a bare-repository pool by `git config --get core.bare`, never by the common-dir-versus-worktree path relationship alone — that relationship cannot tell a non-bare repository's linked worktree from a bare-pool member ([audit])
- NEVER: resolve `.spx/` shared state to `git rev-parse --show-toplevel` — it strands session state no other worktree can see ([audit])
- NEVER: resolve `.spx/local/` per-worktree state to the Git common-dir product root — it leaks one branch's evidence into every worktree ([audit])
- NEVER: derive the main checkout or any worktree classification from a recorded tool path, a `.git` file-versus-directory test, the checked-out branch, or any signal other than git plumbing — the `origin` remote's repository name, the directory name, the common-dir relationship, and the common-dir bareness ([audit])
