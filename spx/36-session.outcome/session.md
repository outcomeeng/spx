# Session Management

WE BELIEVE THAT providing CLI commands for session management (list, show, pickup, release, handoff, delete, prune, archive) that complete in <100ms
WILL cause agents to adopt CLI-based session handoffs instead of manual file operations, reducing context-switch latency by 95%
CONTRIBUTING TO reduced duplicated work and context loss across agent sessions, preserving engineering velocity

## Assertions

### Scenarios

- Given an agent with context to preserve, when the agent pipes content to `spx session handoff`, then a session file is created in the todo directory with a timestamp ID ([test](tests/session.integration.test.ts))
- Given multiple agents running concurrently, when two agents attempt to pick up the same session, then exactly one succeeds and the other receives an error ([test](tests/session.integration.test.ts))
- Given a session with `specs:` and `files:` in YAML front matter, when an agent picks up the session, then listed file contents are printed to stdout with clear delimiters ([test](tests/session.integration.test.ts))

### Properties

- All session CLI commands complete in <100ms excluding I/O wait ([test](tests/session.unit.test.ts))
- Session state is determined entirely by directory location (todo/, doing/, archive/) — never by filename or file content ([test](tests/session.unit.test.ts))

### Compliance

- ALWAYS: resolve `.spx/sessions/` relative to the main repository root (root worktree) per PDR-15 ([review](../15-worktree-resolution.pdr.md))
- NEVER: create `.spx/` directories inside git worktrees — session state is shared across all worktrees ([review](../15-worktree-resolution.pdr.md))
