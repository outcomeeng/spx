# Worktree Detection

The git-detection module exposes two product-directory resolvers for the modes in `spx/15-worktree-resolution.pdr.md`: `detectWorktreeProductRoot` for tracked `spx/` and per-worktree `.spx/local/` state, and `detectGitCommonDirProductRoot` for shared `.spx/` state. Session commands resolve paths through `resolveSessionConfig`, which delegates to `detectGitCommonDirProductRoot`.

## Rationale

Two resolver concepts cleanly separate the two resolution modes the worktree-resolution PDR defines — local-worktree state versus shared `.spx/` state — so a caller picks the resolver by the class of state it touches rather than re-deriving the worktree topology. `--git-common-dir` is preferred over `--show-toplevel` for shared state because only it points at the one `.git` directory every worktree shares, and resolving its output against `--show-toplevel` handles both relative and absolute forms across git versions, avoiding a dependence on `--path-format=absolute` (git 2.31+). `resolveSessionConfig` encapsulates the session-directory rule so individual commands stay simple and never re-implement the precedence between an explicit `--sessions-dir` and the Git common-dir default.

## Invariants

- `detectGitCommonDirProductRoot` returns the parent of the common dir resolved from `git rev-parse --git-common-dir` against `git rev-parse --show-toplevel`.
- In a non-worktree repository, `detectGitCommonDirProductRoot` returns the same root as `detectWorktreeProductRoot`.
- `resolveSessionConfig` returns absolute paths; an explicit `--sessions-dir` overrides the Git common-dir default and skips git detection.

## Verification

### Audit

- ALWAYS: resolve `detectWorktreeProductRoot` via `git rev-parse --show-toplevel` to return the local worktree root for tracked `spx/` and per-worktree `.spx/local/` state ([audit])
- ALWAYS: use `--git-common-dir` to find the Git common-dir product root — `--show-toplevel` returns the local worktree root ([audit])
- ALWAYS: resolve `--git-common-dir` output against `--show-toplevel` when it is relative — this handles all git versions ([audit])
- ALWAYS: reuse the existing `GitDependencies` injection interface — the same testability pattern ([audit])
- ALWAYS: return result shapes that share the base `GitProductDirResult` — `detectWorktreeProductRoot` returns the base shape and `detectGitCommonDirProductRoot` returns a subtype adding the required `worktreeRoot` field, per `spx/16-config.enabler/65-product-directory-api.enabler/21-git-root-result-shape.adr.md` ([audit])
- ALWAYS: use `detectWorktreeProductRoot` for per-worktree `.spx/local/` state access — the same local-root resolution as `spx/` operations ([audit])
- NEVER: modify `detectWorktreeProductRoot` to use `--git-common-dir` — that breaks `spx/` and `.spx/local/` operations per `spx/15-worktree-resolution.pdr.md` ([audit])
- NEVER: detect worktrees by checking for a `.git` file versus directory — use git plumbing per `spx/15-worktree-resolution.pdr.md` ([audit])
- NEVER: let session commands use `DEFAULT_SESSION_CONFIG` with relative paths — that breaks in worktrees ([audit])
