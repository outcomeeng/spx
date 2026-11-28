---
id: 01a22100-5c4e-7a21-9d3b-6f0e2c41a7d8
---

# Product Root

PROVIDES product-root resolution by state class — `resolveLocalProductRoot` for tracked `spx/`, the configuration and the tracked-path set, `detectWorktreeProductRoot` for per-worktree `.spx/worktree/` state, and `detectGitCommonDirProductRoot` for shared `.spx/` state — returning a base `GitProductDirResult` and a Git-common-dir variant carrying the worktree root, per [spx/17-state.adr.md](spx/17-state.adr.md) and [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md)
SO THAT the worktree-topology and scope-addressing siblings and the release, spec-domain, session, and testing consumers
CAN resolve which directory a command's tracked, per-worktree, and shared state belongs to without re-deriving git topology

## Assertions

### Test.Scenario: shared root

- [shared-root-pool-worktree](tests/root-resolution.scenario.l1.test.ts):
  - Given a worktree of a bare-repository pool
  - When the shared product root is resolved
  - Then it is the parent of `git rev-parse --git-common-dir`
- [shared-root-single-clone](tests/root-resolution.scenario.l1.test.ts):
  - Given a non-worktree repository
  - When the shared product root is resolved
  - Then it equals the local worktree root

### Test.Scenario: local root

- [local-root-config-at-toplevel](tests/root-resolution.scenario.l1.test.ts):
  - Given an invocation directory nested below the git toplevel and `spx.config.*` only at the toplevel
  - When the local product root is resolved
  - Then it is the git toplevel
- [local-root-outside-git](tests/root-resolution.scenario.l1.test.ts):
  - Given an invocation directory outside any git repository
  - When the local product root is resolved
  - Then it is the effective invocation directory, and a warning reports the fallback
- [inherited-git-environment](tests/env-isolation.scenario.l1.test.ts):
  - Given inherited `GIT_DIR` and `GIT_WORK_TREE` environment variables
  - When product roots are detected
  - Then resolution uses the effective invocation directory's repository rather than the inherited git environment

### Test.Mapping: [local-product-root](tests/local-product-root.mapping.l1.test.ts)

Each layout of a product nested in a repository maps to the local product root that [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md) defines for it, with and without `-C`.

| Case                 | Recognized `spx.config.*` at                         | Local product root                 |
| -------------------- | ---------------------------------------------------- | ---------------------------------- |
| config-at-invocation | the invocation directory                             | the invocation directory           |
| config-at-ancestor   | an ancestor below the git toplevel                   | that ancestor                      |
| config-at-toplevel   | the git toplevel only                                | the git toplevel                   |
| no-config            | no directory up to the git toplevel                  | the git toplevel                   |
| outside-git          | the invocation directory, outside any git repository | the effective invocation directory |

### Test.Mapping: [common-dir-worktree-root](tests/result-shape.mapping.l1.test.ts)

Each `detectGitCommonDirProductRoot` resolution outcome maps to the `worktreeRoot` its result carries.

| Case                | `worktreeRoot`              |
| ------------------- | --------------------------- |
| git-success         | the `--show-toplevel` value |
| common-dir-fallback | the `--show-toplevel` value |
| non-git             | `cwd`                       |
| git-error           | `cwd`                       |

### Test.Mapping: [common-dir-product-dir](tests/result-shape.mapping.l1.test.ts)

Each outcome of the `--git-common-dir` read maps to the `productDir` of the Git-common-dir result.

| Case        | `productDir`                       |
| ----------- | ---------------------------------- |
| read-ok     | the parent of the common directory |
| read-failed | the `--show-toplevel` value        |

### Test.Mapping: [worktree-result-shape](tests/result-shape.mapping.l1.test.ts)

Each `detectWorktreeProductRoot` outcome maps to a base `GitProductDirResult` that carries no `worktreeRoot` field.

| Case        | `productDir`                       | `worktreeRoot` field |
| ----------- | ---------------------------------- | -------------------- |
| git-success | the worktree root                  | absent               |
| non-git     | the effective invocation directory | absent               |
