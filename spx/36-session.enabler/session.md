# Session Management

PROVIDES CLI commands for session management (list, show, pickup, release, handoff, delete, prune, archive) with worktree-aware root resolution
SO THAT agent orchestration tools (Claude Code plugins, /pickup, /handoff)
CAN create, claim, release, and clean up work handoffs that remain accessible from every worktree of the repository

## Assertions

### Scenarios

- Given a git worktree, when a session command resolves its root directory, then the Git common-dir product root, not the local worktree root, is returned ([test](tests/session.scenario.l1.test.ts))
- Given no explicit `--sessions-dir` option, when a session command resolves its config, then all session paths derive from the Git common-dir product root ([test](tests/session.scenario.l1.test.ts))
- Given an explicit `--sessions-dir` option, when a session command resolves its config, then the provided directory is used and git detection is skipped ([test](tests/session.scenario.l1.test.ts))

### Properties

- The gitignored-state root resolver returns the same root as the tracked-file root resolver in non-worktree repositories and the Git common-dir product root in worktrees ([test](tests/session.scenario.l1.test.ts))

### Compliance

- ALWAYS: resolve `.spx/sessions/` relative to the Git common-dir product root per PDR-15 ([review](../15-worktree-management.pdr.md))
- NEVER: create `.spx/` directories inside git worktrees — session state is shared across all worktrees per PDR-15 ([review](../15-worktree-management.pdr.md))
