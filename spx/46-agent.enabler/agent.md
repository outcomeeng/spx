# Agent

PROVIDES coding-agent runtime session coordination
SO THAT users operating Codex and Claude Code in a product worktree
CAN find and continue runtime-native agent sessions from the SPX CLI

## Assertions

### Compliance

- ALWAYS: agent runtime session coordination treats Codex and Claude Code runtime-native sessions as distinct from SPX handoff session files under `.spx/sessions/` ([audit])
