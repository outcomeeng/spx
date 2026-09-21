# Claude Code

PROVIDES the Claude Code coding agent's own adapter facts — registered agent id,
session-store resolution, agent-session identity variable, transcript metadata
shape, native resume command, hook stdout policy default, and the marketplace,
plugin, and skill capability surface
SO THAT hook agent classification, harness environment configuration, session
identity resolution, agent resume and search, environment diagnosis, and every
coding agent that consumes this capability surface
CAN address Claude Code through its declared facts without any of them
enumerating which coding agents SPX supports

## Assertions

### Compliance

- ALWAYS: Claude Code sessions resolve from `CLAUDE_CONFIG_DIR` plus `projects` when that variable is set, and from `~/.claude/projects` otherwise ([test](tests/claude-code.compliance.l1.test.ts))
- ALWAYS: a command running inside a Claude Code agent session reads its agent session identity from `CLAUDE_CODE_SESSION_ID` ([test](tests/claude-code.compliance.l1.test.ts))
- ALWAYS: Claude Code resolves `hooks.sessionStart.compactStdout` to true, so a compact-source `session-start` invocation classified as Claude Code emits the compact foundation directive as hook stdout ([test](tests/claude-code.compliance.l1.test.ts))
- ALWAYS: Claude Code candidate transcripts exclude subagent transcripts, because a subagent thread is not a resumable top-level conversation ([test](tests/claude-code.compliance.l1.test.ts))
- ALWAYS: the Claude Code capability surface carries marketplaces, plugins, and skills as native packages a consuming coding agent installs without artifact translation ([audit])

### Mappings

- The Claude Code project directory name maps to the session's recorded working directory without opening a transcript, and each transcript row repeats the branch, so Claude Code participates in both worktree scope and branch scope ([test](tests/claude-code.mapping.l1.test.ts))
- A Claude Code candidate maps to the native resume invocation `claude --resume <session-id>` launched from the candidate's recorded working directory ([test](tests/claude-code.mapping.l1.test.ts))
