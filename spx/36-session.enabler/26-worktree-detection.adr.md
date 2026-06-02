# Worktree Detection

## Purpose

This decision governs how the git root detection module implements the root resolution modes required by `spx/15-worktree-resolution.pdr.md`: the Git common-dir product root for shared `.spx/` operations and the local worktree root for tracked `spx/` and per-worktree `.spx/local/` operations.

## Context

**Business impact:** Session commands create and read files under `.spx/sessions/`. In a worktree, `.spx/` exists only at the Git common-dir product root. All session commands must resolve paths against that root, not the local worktree root.

**Technical constraints:** `git rev-parse --show-toplevel` returns the local worktree root, not the Git common-dir product root. `git rev-parse --git-common-dir` returns the path to the shared `.git` directory; its parent is the Git common-dir product root. The git detection module uses dependency injection for testability.

## Decision

The git detection module exposes separate product-directory resolvers for tracked-file resolution and gitignored-state resolution. Session commands call `detectGitCommonDirProductRoot`; spec-tree, validation, and testing-state commands call `detectWorktreeProductRoot`.

```
detectWorktreeProductRoot        → git rev-parse --show-toplevel   → local worktree root (for spx/ and .spx/local/)
detectGitCommonDirProductRoot    → git rev-parse --git-common-dir  → Git common-dir product root (for .spx/)
```

`detectGitCommonDirProductRoot`:

1. Runs `git rev-parse --show-toplevel` to get the local worktree root
2. Runs `git rev-parse --git-common-dir` to get the common `.git` directory path
3. Resolves the common dir against the toplevel when the common dir is relative
4. Returns the parent of the resolved common dir as the Git common-dir product root

In a non-worktree repository, `--git-common-dir` returns `.git` relative to the local worktree root, so `dirname(resolve(toplevel, ".git"))` equals `toplevel`.

`resolveSessionConfig` encapsulates the session directory rule: an explicit `--sessions-dir` option wins, and the default session paths derive from the Git common-dir product root.

## Rationale

Two resolver concepts cover the resolution modes in `spx/15-worktree-resolution.pdr.md`. `detectWorktreeProductRoot` returns the local worktree root for tracked `spx/` and per-worktree `.spx/local/` operations; `detectGitCommonDirProductRoot` returns the Git common-dir product root for shared `.spx/` operations.

Resolving `--git-common-dir` against `--show-toplevel` handles both relative and absolute paths across git versions, avoiding dependence on `--path-format=absolute` (git 2.31+).

`resolveSessionConfig` encapsulates session directory resolution: it accepts an optional explicit path and defaults to Git common-dir product-root detection, returning absolute `SessionDirectoryConfig` paths.

## Trade-offs accepted

| Trade-off                                                    | Mitigation / reasoning                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Two git commands instead of one for `.spx/` resolution       | Both commands are fast (<10ms); latency is negligible for CLI operations        |
| Session commands must switch from relative to absolute paths | `resolveSessionConfig` encapsulates the change; individual commands get simpler |

## Compliance

### Recognized by

`detectGitCommonDirProductRoot` calls `--git-common-dir` and derives the Git common-dir product root. Session commands call `resolveSessionConfig`, which delegates to `detectGitCommonDirProductRoot`.

### MUST

- Use `--git-common-dir` to find the Git common-dir product root — `--show-toplevel` returns the local worktree root ([review])
- Resolve `--git-common-dir` output against `--show-toplevel` when relative — handles all git versions ([review])
- Reuse the existing `GitDependencies` injection interface — same testability pattern ([review])
- Return the same `GitProductDirResult` type from both product-directory resolvers — consistent API ([review])
- Use `detectWorktreeProductRoot` for per-worktree `.spx/local/` state access — the same local-root resolution as `spx/` operations ([review])

### NEVER

- Modify `detectWorktreeProductRoot` to use `--git-common-dir` — breaks `spx/` and `.spx/local/` operations per `spx/15-worktree-resolution.pdr.md` ([review])
- Check for `.git` file vs directory to detect worktrees — use git plumbing per `spx/15-worktree-resolution.pdr.md` ([review])
- Let session commands use `DEFAULT_SESSION_CONFIG` with relative paths — breaks in worktrees ([review])
