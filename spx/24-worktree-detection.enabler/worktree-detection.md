# Worktree Detection

PROVIDES the git worktree-detection module that resolves a checkout's product roots by state class, resolves the repository default branch, and designates the repository's main checkout
SO THAT the session, release, spec-domain, testing, and precommit domains
CAN resolve shared, per-worktree, and tracked roots and gate main-checkout-only behaviour without each re-deriving git topology, per `spx/15-worktree-management.pdr.md`

## Assertions

### Scenarios

- Given a worktree of a bare-repository pool, when the shared product root is resolved, then it is the parent of `git rev-parse --git-common-dir`, and given a non-worktree repository it equals the local worktree root ([test](tests/root-resolution.scenario.l1.test.ts))
- Given any checkout, when the local product root is resolved, then it is `git rev-parse --show-toplevel`; outside a git repository resolution falls back to the working directory with a warning ([test](tests/root-resolution.scenario.l1.test.ts))
- Given a non-bare repository whose only working tree is its root, when the main checkout is resolved, then that lone working tree is the main checkout whatever branch it holds ([test](tests/main-checkout.scenario.l1.test.ts))

### Mappings

- In a bare-repository pool the main checkout maps from three signals together — a worktree is the main checkout when its checked-out branch equals `origin/HEAD`'s target, its directory basename equals that branch name, and its git-common-dir's parent equals the worktree's parent; any signal disagreeing maps to not-the-main-checkout, and a pool with no agreeing worktree maps to no main checkout ([test](tests/main-checkout.mapping.l1.test.ts))

### Compliance

- ALWAYS: resolve the repository default branch from `git symbolic-ref refs/remotes/origin/HEAD`, returning no branch when `origin/HEAD` is unset, rather than a hardcoded name ([test](tests/default-branch.scenario.l1.test.ts))
- NEVER: derive the main checkout or any worktree classification from a recorded tool path, or from a `.git` file-versus-directory test — classification reads git plumbing only ([audit])
