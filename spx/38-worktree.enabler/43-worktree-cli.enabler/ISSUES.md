# Worktree CLI Issues

## Status target accepts paths but not pool worktree basenames

`spx worktree status <target>` resolves `<target>` as a filesystem path from the caller's current directory. Passing a pool worktree basename such as `plugins-e` from outside the pool member therefore fails with `path resolves to no worktree: plugins-e`, even though a human reading `git worktree list` sees `plugins-e` as the worktree name.

**Evidence:** `resolveTargetWorktree` resolves the status argument through `resolve(base, options.worktree)` and refuses it when `detectWorktreeProductRoot` reports a non-git path. The observed report ran `spx worktree status plugins-e --format json` and received `Error: path resolves to no worktree: plugins-e`.

**Impact:** This makes manual diagnosis harder and creates a mismatch between the JSON field `{"worktree":"plugins-e"}` and the accepted command argument shape.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Either document the argument as a path and improve the error/help text, or teach `status` to resolve a sibling pool basename through `git worktree list` when the path lookup fails.

## `--all --format json` L2 compliance test shares production git-facts parsing

The L2 compliance test for `spx worktree status --all --format json` derives its multi-worktree expected entries by calling the same `gatherGitFacts(firstPath)` path that production uses through `resolveAllTargetWorktrees`, so list-content and ordering bugs in shared git worktree parsing can self-validate on both expected and actual sides.

**Evidence:** PR #298 spec-tree review classified this as FOLLOW-UP [evidence] after the `spx worktree status --all --format json` compliance assertion was added. The single-worktree L2 case and L1 scenario test still provide independent evidence for JSON-array shape, ordering, and claim-name derivation, while the multi-worktree L2 case primarily proves CLI wiring against a real packaged executable.

**Impact:** The compliance evidence is bounded but uneven: the L2 test covers Commander flag parsing and packaged JSON-array behavior, while domain parsing correctness depends on the lower-level scenario evidence rather than an independent real-git oracle.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Replace the shared-production oracle with an independent real-git expectation for the multi-worktree L2 test, or split the spec assertions so L2 is cited only for packaged CLI wiring while L1 carries the ordering and claim-name evidence.
