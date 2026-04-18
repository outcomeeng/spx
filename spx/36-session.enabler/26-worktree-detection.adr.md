# Worktree Detection

## Purpose

This decision governs how the git root detection module implements the two root resolution modes required by PDR-15: main repository root for `.spx/` operations and local worktree root for `spx/` operations.

## Context

**Business impact:** Session commands create and read files under `.spx/sessions/`. In a worktree, `.spx/` exists only at the main repository root. All session commands must resolve paths against that root, not the worktree root.

**Technical constraints:** `git rev-parse --show-toplevel` returns the worktree root, not the main repository root. `git rev-parse --git-common-dir` returns the path to the shared `.git` directory — its parent is the main repository root. The git detection module uses dependency injection for testability.

## Decision

Add `detectMainRepoRoot` alongside the existing `detectGitRoot`. Session commands call `detectMainRepoRoot`; spec-tree and validation commands continue using `detectGitRoot`.

```
detectGitRoot        → git rev-parse --show-toplevel       → worktree root (for spx/)
detectMainRepoRoot   → git rev-parse --git-common-dir      → main repo root (for .spx/)
```

`detectMainRepoRoot` implementation:

1. Run `git rev-parse --show-toplevel` to get the worktree/repo root
2. Run `git rev-parse --git-common-dir` to get the common `.git` directory path
3. If common dir is relative, resolve it against the toplevel
4. Return the parent of the resolved common dir as the main repo root

In a non-worktree repository, `--git-common-dir` returns `.git` relative to the repo root, so `dirname(resolve(toplevel, ".git"))` equals `toplevel` — identical behavior.

Additionally, add `resolveSessionConfig` to encapsulate the pattern every session command repeats: "if `--sessions-dir` provided, use it; otherwise detect main repo root and build absolute paths."

## Rationale

Two functions map directly to the two rows in PDR-15's decision table. `detectGitRoot` returns the worktree root for tracked-file operations; `detectMainRepoRoot` returns the main repository root for gitignored-state operations.

Resolving `--git-common-dir` against `--show-toplevel` handles both relative and absolute paths across git versions, avoiding dependence on `--path-format=absolute` (git 2.31+).

`resolveSessionConfig` encapsulates session directory resolution: it accepts an optional explicit path and defaults to main-repo-root detection, returning absolute `SessionDirectoryConfig` paths.

## Trade-offs accepted

| Trade-off                                                    | Mitigation / reasoning                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Two git commands instead of one for `.spx/` resolution       | Both commands are fast (<10ms); latency is negligible for CLI operations        |
| Session commands must switch from relative to absolute paths | `resolveSessionConfig` encapsulates the change; individual commands get simpler |

## Compliance

### Recognized by

`detectMainRepoRoot` calls `--git-common-dir` and derives the main repo root. Session commands call `resolveSessionConfig` which delegates to `detectMainRepoRoot`.

### MUST

- Use `--git-common-dir` to find the main repo root — `--show-toplevel` returns worktree root ([review])
- Resolve `--git-common-dir` output against `--show-toplevel` when relative — handles all git versions ([review])
- Reuse the existing `GitDependencies` injection interface — same testability pattern ([review])
- Return the same `GitRootResult` type from both functions — consistent API ([review])

### NEVER

- Modify `detectGitRoot` to use `--git-common-dir` — breaks `spx/` operations per PDR-15 ([review])
- Check for `.git` file vs directory to detect worktrees — use git plumbing per PDR-15 ([review])
- Let session commands use `DEFAULT_SESSION_CONFIG` with relative paths — breaks in worktrees ([review])

## Testing Strategy

### Level Assignments

| Component                                    | Level    | Justification                                                    |
| -------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `detectMainRepoRoot` path resolution logic   | 1 (Unit) | Pure path computation with injected `execa` — no real git needed |
| `resolveSessionConfig` config building       | 1 (Unit) | Pure function: options + root → config                           |
| `detectMainRepoRoot` with real git worktrees | 1 (Unit) | Git is a Level 1 tool; create real worktrees in temp dirs        |
| Session commands using resolved config       | 1 (Unit) | Inject fake git root; verify paths are absolute                  |

### Escalation Rationale

All components stay at Level 1. Git is a standard dev tool (Level 1 per testing framework). Worktrees can be created in temp directories with `git worktree add`. No project-specific binaries or network access needed.
