# Agent

PROVIDES coding-agent session identity, resume, search, and closure coordination
SO THAT users and managed workflows operating Codex, Claude Code, or Pi in a product worktree
CAN find, continue, bind evidence to, and close the exact native coding-agent session from the SPX CLI

## Assertions

### Compliance

- ALWAYS: agent resume coordination resolves Codex and Claude Code homes from `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, and resolves Pi sessions from `PI_CODING_AGENT_SESSION_DIR` before `PI_CODING_AGENT_DIR`, before default home-directory paths ([test](tests/agent-home-resolution.compliance.l1.test.ts))
- ALWAYS: agent search coordination resolves Codex and Claude Code homes from `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, and resolves Pi sessions from `PI_CODING_AGENT_SESSION_DIR` before `PI_CODING_AGENT_DIR`, before default home-directory paths ([test](tests/agent-home-resolution.compliance.l1.test.ts))
- ALWAYS: coding-agent session coordination treats Codex, Claude Code, and Pi native sessions as distinct from SPX handoff session files under `.spx/sessions/` ([audit])
- ALWAYS: a managed methodology migration binds resume, verification evidence, and closure to the exact native coding-agent session that owns the migration attempt ([audit])
- NEVER: an SPX handoff session substitutes for the native coding-agent session identity required to resume or complete a methodology migration ([audit])
