# Worktree Detection

PROVIDES the git worktree-detection module that resolves a checkout's product roots by state class, resolves the repository default branch, and designates the repository's main checkout
SO THAT the session, release, spec-domain, testing, and precommit domains
CAN resolve shared, per-worktree, and tracked roots and gate main-checkout-only behaviour without each re-deriving git topology, per `spx/15-worktree-management.pdr.md`

## Assertions

### Scenarios

- Given a worktree of a bare-repository pool, when the shared product root is resolved, then it is the parent of `git rev-parse --git-common-dir`, and given a non-worktree repository it equals the local worktree root ([test](tests/root-resolution.scenario.l1.test.ts))
- Given any checkout, when the local product root is resolved, then it is `git rev-parse --show-toplevel`; outside a git repository resolution falls back to the working directory with a warning ([test](tests/root-resolution.scenario.l1.test.ts))
- Given a non-bare repository whose only working tree is its root, when the main checkout is resolved, then that lone working tree is the main checkout whatever branch it holds ([test](tests/main-checkout.scenario.l1.test.ts))
- Given a real bare-repository pool with an `origin` remote, when the main checkout is resolved, then `detectMainCheckout` is true for the worktree named after the `origin` repository and false for a feature worktree ([test](tests/main-checkout.scenario.l1.test.ts))

### Mappings

- In a bare-repository pool the main checkout maps from two signals together — a worktree is the main checkout when its directory basename equals the `origin` remote's repository name and its git-common-dir's parent equals the worktree's parent; either signal disagreeing maps to not-the-main-checkout, a pool with no agreeing worktree maps to no main checkout, and the mapping is independent of the checked-out branch ([test](tests/main-checkout.mapping.l1.test.ts))
- In a non-bare repository the main working tree — the parent of the git-common-dir — is the main checkout and every linked worktree is not, even when a linked worktree's directory basename matches the bare-pool rule, because bareness (`git config --get core.bare`), not directory shape, selects the layout ([test](tests/main-checkout.mapping.l1.test.ts))
- The designated main-checkout path maps from the repository's layout: a non-bare repository — with or without linked worktrees — designates its main working tree, the parent of the git-common-dir, from any of its worktrees; a bare-repository pool designates the parent of the git-common-dir joined with the `origin` remote's repository name, or no path when `origin` resolves no repository name; and whenever a checkout is the main checkout, its own worktree root equals the designated path ([test](tests/main-checkout-path.mapping.l1.test.ts))

### Compliance

- ALWAYS: resolve the repository default branch from `git symbolic-ref refs/remotes/origin/HEAD`, returning no branch when `origin/HEAD` is unset, rather than a hardcoded name ([test](tests/default-branch.scenario.l1.test.ts))
- NEVER: derive the main checkout or any worktree classification from a recorded tool path, a `.git` file-versus-directory test, or the checked-out branch — classification reads git plumbing only ([audit])
