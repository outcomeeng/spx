# Product Root

PROVIDES product-root resolution by state class — `detectWorktreeProductRoot` for tracked `spx/` and per-worktree `.spx/worktree/` state, and `detectGitCommonDirProductRoot` for shared `.spx/` state — returning a base `GitProductDirResult` and a Git-common-dir variant carrying the worktree root, per [spx/17-state.adr.md](spx/17-state.adr.md) and [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md)
SO THAT the worktree-topology and scope-addressing siblings and the release, spec-domain, session, and testing consumers
CAN resolve which directory a command's tracked, per-worktree, and shared state belongs to without re-deriving git topology

## Assertions

### Scenarios

- Given a worktree of a bare-repository pool, when the shared product root is resolved, then it is the parent of `git rev-parse --git-common-dir`, and given a non-worktree repository it equals the local worktree root ([test](tests/root-resolution.scenario.l1.test.ts))
- Given a working directory outside every git repository, when the local product root is resolved, then resolution falls back to the working directory with a warning ([test](tests/root-resolution.scenario.l1.test.ts))
- Given inherited `GIT_DIR` and `GIT_WORK_TREE` environment variables, when product roots are detected, then resolution uses the working directory's repository rather than the inherited git environment ([test](tests/env-isolation.scenario.l1.test.ts))

### Mappings

- Every worktree of a non-bare single-tree repository, a non-bare repository with a linked worktree, and a bare-repository pool maps its local product root to its own `git rev-parse --show-toplevel` worktree root ([test](tests/local-root.mapping.l1.test.ts))
- Each `detectGitCommonDirProductRoot` resolution outcome maps to a result carrying `worktreeRoot`: the `git rev-parse --show-toplevel` value on the git-success and common-dir-fallback paths, and `cwd` on the non-git and git-error paths ([test](tests/result-shape.mapping.l1.test.ts))
- A successful `--git-common-dir` read maps `productDir` to the parent of that common directory; a failed read maps `productDir` to the `--show-toplevel` value ([test](tests/result-shape.mapping.l1.test.ts))
- A `detectWorktreeProductRoot` outcome maps to a base `GitProductDirResult` carrying no `worktreeRoot` field, its `productDir` the worktree root ([test](tests/result-shape.mapping.l1.test.ts))
