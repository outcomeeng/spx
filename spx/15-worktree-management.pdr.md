# Worktree Management

spx commands resolve product roots from an effective invocation directory. Without `-C`, the invoking process directory is the effective invocation directory; with `-C <path>`, that path is the effective invocation directory and the caller's ambient directory is irrelevant to target command behavior except for resolving a relative `-C` argument. From that effective invocation directory, each state class resolves to either the Git common-dir product root or the local worktree root, and at most one worktree is the **main checkout** independent of which branch any worktree has checked out. The main checkout permanently holds the repository's default branch — `main` for this product — so Git refuses attempts to check that branch out in a linked worktree.

## Rationale

Git worktrees share one Git common directory while each keeps its own working copy of tracked files. The three state classes follow that split. Session state exists once per repository and must be reachable from any worktree, so it resolves to the Git common-dir product root every worktree shares. Branch-scoped local state follows the reviewable changeset across worktrees, so it also resolves to the shared root. Worktree-occupancy claims record once per repository which agent holds each worktree, so any worktree can read whether a sibling is held; they resolve to the shared root as well. The tracked `spx/` spec tree varies per branch, so it resolves to the worktree's own working copy. Per-worktree local state — test-run evidence and compact resume state tied to dirty files in one checkout — describes one working copy's current state, so resolving it to the worktree root keeps each branch's evidence with that branch and lets the evidence be discarded with the worktree, instead of accumulating branch-slugged directories under the shared root.

| State class                                                                                   | Root resolution             | Git mechanism                              |
| --------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| `.spx/branch/`, `.spx/changes/`, `.spx/sessions/`, and `.spx/worktrees/` (gitignored, shared) | Git common-dir product root | Parent of `git rev-parse --git-common-dir` |
| `.spx/worktree/` (gitignored, per-worktree)                                                   | Local worktree root         | `git rev-parse --show-toplevel`            |
| `spx/` (tracked)                                                                              | Local worktree root         | `git rev-parse --show-toplevel`            |

Resolving every directory to a single root fails one class or another: a single common-dir root reads the wrong branch's spec tree and dirty-checkout evidence from sibling worktrees; a single worktree root strands shared session and branch state where no other worktree can see it.

An explicit product directory context gives agents and developers the same root-selection semantics from any shell location. A foreign agent can operate on another product by naming it with `-C` without making the caller's dirty worktree part of the target command, while a caller that omits `-C` intentionally operates from the current working copy and receives that worktree's gates and diagnostics. Treating `-C` as an effective invocation directory, rather than as an actual process directory change or a command-local override, keeps every domain on the same root-resolution rules and gives monorepos a path to address nested product roots through the same option.

One worktree is canonical because a single working copy backs the repository's shipped artifacts and its session continuity. A non-bare repository has one main working tree, canonical whether or not linked worktrees join it. In a pool the canonical worktree is the one beside the bare repository whose directory name is the repository's own — the `origin` remote's repository name — because naming it after the default branch instead puts every repository's main checkout in a directory named for that branch, so a developer working across repositories sees the same directory and window name everywhere; the repository name gives each a distinct `product/product` location while staying a value git already holds. The designation ignores the checked-out branch: placement and name keep the canonical worktree's identity and shared session-state reachability stable independently of its current branch. The identified main checkout permanently keeps the default branch checked out, using Git's single-worktree branch occupancy as the safety boundary that reserves the release and shipped-artifact mutation site from linked worktrees. Sibling placement and the repository-name match designate at most one worktree, so a pool missing it resolves to no main checkout rather than the wrong one.

## Product properties

- Shared session, change, worktree-occupancy, and branch-scoped state are visible from every worktree of a repository, while tracked `spx/` files and `.spx/worktree/` state stay local to the current worktree.
- `spx -C <path> ...` operates as if `<path>` supplied the command's invocation directory for product-root, config, worktree, and shared-state resolution, while the caller's ambient directory does not participate in target command gates.
- At most one worktree of a repository is the main checkout: a non-bare repository's main working tree, or the pool worktree beside the bare repository whose directory name is the `origin` remote's repository name; a pool without that observed worktree has no main checkout, and the designation does not depend on the branch any worktree has checked out. The designated main checkout permanently holds the repository's default branch, which remains unavailable to linked worktrees through Git's branch-occupancy constraint.

## Verification

### Testing

- ALWAYS: in a non-bare repository — with or without linked worktrees — the main checkout is the main working tree, the parent of the Git common directory, reachable from any worktree and independent of the branch checked out ([mapping])
- ALWAYS: in a bare-repository worktree pool, a worktree is the main checkout exactly when it sits beside the bare repository (`dirname(git-common-dir)` equals the worktree root's parent) and its directory basename equals the `origin` remote's repository name; a pool with no such worktree has no main checkout, whatever branch any worktree holds ([mapping])
- ALWAYS: a command invoked with `-C <path>` resolves product-root, config, worktree, main-checkout, and shared-state paths from `<path>` exactly as the same command invoked from `<path>` without `-C` ([mapping])
- ALWAYS: when `-C <path>` is present, target command gates inspect the worktree and shared state reached from `<path>`, not the caller's ambient directory or its dirty state ([compliance])
- ALWAYS: when `-C` is absent, command root resolution starts from the invoking process directory and target command gates inspect that worktree ([mapping])

### Audit

- ALWAYS: expose `-C <path>` as a global CLI option whose resolved path becomes the effective invocation directory for every command domain ([audit])
- ALWAYS: resolve `.spx/branch/`, `.spx/changes/`, `.spx/sessions/`, `.spx/worktrees/`, and other shared `.spx/` state to the Git common-dir product root — the parent of `git rev-parse --git-common-dir` ([audit])
- ALWAYS: resolve `.spx/worktree/` per-worktree state and tracked `spx/` files to the local worktree root via `git rev-parse --show-toplevel` ([audit])
- ALWAYS: fall back to the current working directory with a warning when the command runs outside a git repository ([audit])
- ALWAYS: separate a non-bare repository from a bare-repository pool by `git config --get core.bare`, never by the common-dir-versus-worktree path relationship alone — that relationship cannot tell a non-bare repository's linked worktree from a bare-pool member ([audit])
- ALWAYS: product instructions keep the repository's default branch checked out in the main checkout, preserving Git's branch-occupancy refusal for every linked worktree ([audit])
- NEVER: product instructions detach the main checkout, switch it away from the repository's default branch, or direct a linked worktree to check out that branch ([audit])
- NEVER: resolve shared branch, change, session, or worktree-occupancy state to `git rev-parse --show-toplevel` — it strands shared state no other worktree can see ([audit])
- NEVER: resolve `.spx/worktree/` per-worktree state to the Git common-dir product root — it leaks one checkout's dirty-state evidence into every worktree ([audit])
- NEVER: derive the main checkout or any worktree classification from a recorded tool path, a `.git` file-versus-directory test, the checked-out branch, or any signal other than git plumbing — the `origin` remote's repository name, the directory name, the common-dir relationship, and the common-dir bareness ([audit])
