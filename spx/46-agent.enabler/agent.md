# Agent

PROVIDES coding-agent session identity, resume, search, and closure coordination
SO THAT users and managed workflows operating a supported coding agent in a product worktree
CAN find, continue, bind evidence to, and close the exact native coding-agent session from the SPX CLI

## Assertions

### Compliance

- ALWAYS: agent resume and agent search coordination resolve each agent's session store through the resolution order that agent's own node declares, rather than through a store list held by the coordinating node ([test](tests/agent-home-resolution.compliance.l1.test.ts))
- ALWAYS: coding-agent session coordination treats native agent sessions as distinct from SPX handoff session files under `.spx/sessions/` ([audit])
- ALWAYS: coding-agent session coordination exposes each native session's exact identity so a consuming workflow binds evidence to that session and closes it ([audit])
- NEVER: agent coordination enumerates the supported coding agents; the adapter registry is the set of agents declaring an adapter contract ([audit])
