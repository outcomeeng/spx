# Product Root

PROVIDES product-root resolution by state class — the local product root for tracked `spx/`, configuration and the tracked-path set, and worktree-root resolution for per-worktree `.spx/worktree/` state, and `detectGitCommonDirProductRoot` for shared `.spx/` state — returning a base `GitProductDirResult` and a Git-common-dir variant carrying the worktree root, per [spx/17-state.adr.md](spx/17-state.adr.md) and [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md)
SO THAT the worktree-topology and scope-addressing siblings and the release, spec-domain, session, and testing consumers
CAN resolve which directory a command's tracked, per-worktree, and shared state belongs to without re-deriving git topology

## Assertions

### Scenarios

- Given a worktree of a bare-repository pool, when the shared product root is resolved, then it is the parent of `git rev-parse --git-common-dir`, and given a non-worktree repository it equals the local worktree root ([test](tests/root-resolution.scenario.l1.test.ts))
- Given an invocation directory nested below the git toplevel and `spx.config.*` only at the toplevel, when the local product root is resolved, then it is the git toplevel ([test](tests/root-resolution.scenario.l1.test.ts))
- Given an invocation directory outside any git repository, when the local product root is resolved, then it is the working directory and a warning reports the fallback ([test](tests/root-resolution.scenario.l1.test.ts))
- Given inherited `GIT_DIR` and `GIT_WORK_TREE` environment variables, when product roots are detected, then resolution uses the working directory's repository rather than the inherited git environment ([test](tests/env-isolation.scenario.l1.test.ts))

### Mappings

- Each layout — config at the invocation directory, at an intermediate ancestor, only at the git toplevel, nowhere, or the invocation directory outside git — maps to the local product root [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md) defines for it ([test](tests/local-product-root.mapping.l1.test.ts))
- Each `detectGitCommonDirProductRoot` resolution outcome maps to a result carrying `worktreeRoot`: the `git rev-parse --show-toplevel` value on the git-success and common-dir-fallback paths, and `cwd` on the non-git and git-error paths ([test](tests/result-shape.mapping.l1.test.ts))
- A successful `--git-common-dir` read maps `productDir` to the parent of that common directory; a failed read maps `productDir` to the `--show-toplevel` value ([test](tests/result-shape.mapping.l1.test.ts))
- A `detectWorktreeProductRoot` outcome maps to a base `GitProductDirResult` carrying no `worktreeRoot` field, its `productDir` the worktree root ([test](tests/result-shape.mapping.l1.test.ts))
