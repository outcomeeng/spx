# Agent

PROVIDES coding-agent session coordination
SO THAT users operating Codex, Claude Code, or Pi in a product worktree
CAN find and continue Codex, Claude Code, or Pi sessions from the SPX CLI

## Assertions

### Compliance

- ALWAYS: agent resume coordination resolves Codex and Claude Code homes from `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, and resolves Pi sessions from `PI_CODING_AGENT_SESSION_DIR` before `PI_CODING_AGENT_DIR`, before default home-directory paths ([test](tests/agent-home-resolution.compliance.l1.test.ts))
- ALWAYS: agent search coordination resolves Codex and Claude Code homes from `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, and resolves Pi sessions from `PI_CODING_AGENT_SESSION_DIR` before `PI_CODING_AGENT_DIR`, before default home-directory paths ([test](tests/agent-home-resolution.compliance.l1.test.ts))
- ALWAYS: agent session coordination treats Codex, Claude Code, and Pi agent-native sessions as distinct from SPX handoff session files under `.spx/sessions/` ([audit])
