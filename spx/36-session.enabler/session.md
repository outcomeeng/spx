# Session Management

PROVIDES CLI commands for session management (list, show, pickup, release, handoff, delete, prune, archive) with worktree-aware root resolution
SO THAT agent orchestration tools (Claude Code plugins, /pickup, /handoff)
CAN create, claim, release, and clean up work handoffs that remain accessible from every worktree of the repository

## Assertions

### Scenarios

- Given a git worktree, when a session command resolves its root directory, then the main repository root (not the worktree root) is returned ([test](tests/session.unit.test.ts))
- Given no explicit `--sessions-dir` option, when a session command resolves its config, then all session paths derive from the main repository root ([test](tests/session.unit.test.ts))
- Given an explicit `--sessions-dir` option, when a session command resolves its config, then the provided directory is used and git detection is skipped ([test](tests/session.unit.test.ts))

### Properties

- `detectMainRepoRoot` returns the same root as `detectGitRoot` in non-worktree repositories and a different root (the main repo root) in worktrees ([test](tests/session.unit.test.ts))

### Compliance

- ALWAYS: resolve `.spx/sessions/` relative to the main repository root per PDR-15 ([review](../15-worktree-resolution.pdr.md))
- NEVER: create `.spx/` directories inside git worktrees — session state is shared across all worktrees per PDR-15 ([review](../15-worktree-resolution.pdr.md))
