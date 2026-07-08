# Agent

PROVIDES coding-agent session coordination
SO THAT users operating Codex and Claude Code in a product worktree
CAN find and continue agent-native sessions from the SPX CLI

## Assertions

### Compliance

- ALWAYS: agent session coordination resolves Codex and Claude Code homes from `CODEX_HOME` and `CLAUDE_CONFIG_DIR` before default home-directory paths across agent session discovery surfaces ([test](tests/agent-home-resolution.compliance.l1.test.ts))
- ALWAYS: agent session coordination treats Codex and Claude Code agent-native sessions as distinct from SPX handoff session files under `.spx/sessions/` ([audit])
