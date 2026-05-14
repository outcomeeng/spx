# Worktree Detection

## Purpose

This decision governs how the git root detection module implements the two root resolution modes required by PDR-15: Git common-dir product root for `.spx/` operations and local worktree root for `spx/` operations.

## Context

**Business impact:** Session commands create and read files under `.spx/sessions/`. In a worktree, `.spx/` exists only at the Git common-dir product root. All session commands must resolve paths against that root, not the local worktree root.

**Technical constraints:** `git rev-parse --show-toplevel` returns the local worktree root, not the Git common-dir product root. `git rev-parse --git-common-dir` returns the path to the shared `.git` directory; its parent is the Git common-dir product root. The git detection module uses dependency injection for testability.

## Decision

The git detection module exposes separate resolvers for tracked-file root resolution and gitignored-state root resolution. Session commands call the gitignored-state root resolver; spec-tree and validation commands call the tracked-file root resolver.

```
tracked-file root resolver      → git rev-parse --show-toplevel   → local worktree root (for spx/)
gitignored-state root resolver  → git rev-parse --git-common-dir  → Git common-dir product root (for .spx/)
```

The gitignored-state root resolver:

1. Runs `git rev-parse --show-toplevel` to get the local worktree root
2. Runs `git rev-parse --git-common-dir` to get the common `.git` directory path
3. Resolves the common dir against the toplevel when the common dir is relative
4. Returns the parent of the resolved common dir as the Git common-dir product root

In a non-worktree repository, `--git-common-dir` returns `.git` relative to the local worktree root, so `dirname(resolve(toplevel, ".git"))` equals `toplevel`.

`resolveSessionConfig` encapsulates the session directory rule: an explicit `--sessions-dir` option wins, and the default session paths derive from the Git common-dir product root.

## Rationale

Two resolver concepts map directly to the two rows in PDR-15's decision table. The tracked-file root resolver returns the local worktree root for tracked-file operations; the gitignored-state root resolver returns the Git common-dir product root for gitignored-state operations.

Resolving `--git-common-dir` against `--show-toplevel` handles both relative and absolute paths across git versions, avoiding dependence on `--path-format=absolute` (git 2.31+).

`resolveSessionConfig` encapsulates session directory resolution: it accepts an optional explicit path and defaults to Git common-dir product-root detection, returning absolute `SessionDirectoryConfig` paths.

## Trade-offs accepted

| Trade-off                                                    | Mitigation / reasoning                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Two git commands instead of one for `.spx/` resolution       | Both commands are fast (<10ms); latency is negligible for CLI operations        |
| Session commands must switch from relative to absolute paths | `resolveSessionConfig` encapsulates the change; individual commands get simpler |

## Compliance

### Recognized by

The gitignored-state root resolver calls `--git-common-dir` and derives the Git common-dir product root. Session commands call `resolveSessionConfig`, which delegates to the gitignored-state root resolver.

### MUST

- Use `--git-common-dir` to find the Git common-dir product root — `--show-toplevel` returns the local worktree root ([review])
- Resolve `--git-common-dir` output against `--show-toplevel` when relative — handles all git versions ([review])
- Reuse the existing `GitDependencies` injection interface — same testability pattern ([review])
- Return the same `GitRootResult` type from both root resolvers — consistent API ([review])

### NEVER

- Modify the tracked-file root resolver to use `--git-common-dir` — breaks `spx/` operations per PDR-15 ([review])
- Check for `.git` file vs directory to detect worktrees — use git plumbing per PDR-15 ([review])
- Let session commands use `DEFAULT_SESSION_CONFIG` with relative paths — breaks in worktrees ([review])
