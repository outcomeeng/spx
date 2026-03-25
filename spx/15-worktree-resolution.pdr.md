# Worktree Resolution

## Purpose

This decision governs how spx subcommands resolve their root directory when invoked inside a git worktree. Every subcommand operates on either the gitignored `.spx/` directory or the tracked `spx/` directory, and each resolves to a different root.

## Context

**Business impact:** Agents run inside git worktrees created by Claude Code. Correct root resolution ensures session state is shared across all worktrees and spec-tree commands operate on the branch-specific working copy.

**Technical constraints:** Git worktrees share a single `.git` directory (the "common dir") at the main repository root. Each worktree gets its own working copy of tracked files but shares untracked/gitignored state with the main worktree only by convention. The `.spx/` directory is gitignored and exists only at the main repository root. The `spx/` directory is tracked and exists in every worktree's working copy.

## Decision

Each spx subcommand resolves its root directory based on whether it operates on gitignored state (`.spx/`) or tracked state (`spx/`):

| Target directory     | Root resolution                      | Git mechanism                              |
| -------------------- | ------------------------------------ | ------------------------------------------ |
| `.spx/` (gitignored) | Main repository root (root worktree) | Parent of `git rev-parse --git-common-dir` |
| `spx/` (tracked)     | Local worktree root                  | `git rev-parse --show-toplevel`            |

## Rationale

The two directories have different lifecycle semantics. `.spx/` contains ephemeral local state (sessions, caches) that is shared across all worktrees because it is never committed. `spx/` contains durable specifications that vary per branch because they are committed. Resolving both to the same root would either break session sharing across worktrees or break branch-specific spec trees.

Alternatives considered:

- **Always use `--show-toplevel`**: Fails for `.spx/` — creates orphan session directories inside worktrees that no other worktree can see.
- **Always use common dir parent**: Fails for `spx/` — reads the main worktree's spec tree instead of the branch-specific one in the current worktree.
- **Symlink `.spx/` into worktrees**: Fragile, platform-dependent, requires worktree setup hooks.

## Trade-offs accepted

| Trade-off                                              | Mitigation / reasoning                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Two resolution mechanisms add complexity               | Each subcommand declares which root it needs; the resolution logic is a single concern                         |
| Requires git to distinguish worktree from non-worktree | Falls back to `--show-toplevel` when `--git-common-dir` returns `.git` (non-worktree case); identical behavior |

## Product invariants

- `spx session` commands always read and write the same `.spx/sessions/` directory regardless of which worktree the agent runs in
- `spx validation` and spec-tree commands always operate on the current worktree's tracked files

## Compliance

### Recognized by

Running `spx session list` from any worktree of the same repository returns the same sessions.

### MUST

- Use `git rev-parse --git-common-dir` to find the main repository root for `.spx/` operations ([review])
- Use `git rev-parse --show-toplevel` for `spx/` (tracked file) operations ([review])
- Fall back to current working directory with a warning when not in a git repository ([review])

### NEVER

- Resolve `.spx/` relative to `--show-toplevel` — creates orphan state in worktrees ([review])
- Hardcode worktree detection heuristics (e.g., checking for `.git` file vs directory) — use git plumbing commands ([review])
