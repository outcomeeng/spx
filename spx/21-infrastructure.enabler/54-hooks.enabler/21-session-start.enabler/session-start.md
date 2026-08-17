# Session Start

PROVIDES the `session-start` hook event orchestration — resolving the holder
agent and agent session from the payload, establishing worktree occupancy, and
routing compact lifecycle stdout policy
SO THAT installed agent plugins
CAN establish session continuity through one lifecycle hook invocation

## Assertions

### Scenarios

- Given `spx hook run session-start` receives a payload carrying a product directory, a session id, and a transcript path inside a configured agent session-store root, when the invocation supplies worktree scope and controlling process context, then SPX exits successfully and writes a readable worktree claim record carrying the holder agent, agent session id, host, controlling-process id, and start time ([test](tests/session-start.scenario.l2.test.ts))
- Given `spx hook run session-start` receives a payload whose transcript path resolves inside the Pi session-store root, when the invocation supplies worktree scope and controlling process context, then SPX claims the linked worktree under the Pi agent and that payload's session id, and `spx worktree status --format json` reports that running holder ([test](tests/session-start.scenario.l2.test.ts))

### Mappings

- At the packaged CLI boundary, an absent transcript path, a path outside every configured agent session-store root, a path inside more than one, and an absent payload session id each map to degraded successful completion with the matching source-owned diagnostic and `free` worktree status ([test](tests/session-start-rejection.mapping.l2.test.ts))

### Compliance

- ALWAYS: the first required event operand is `session-start`, matching the lowercase hyphenated hook-runner naming used by established hook tools ([test](tests/session-start.compliance.l2.test.ts))
- ALWAYS: `session-start` coordinates holder identity, worktree claiming, and compact lifecycle stdout policy without moving the underlying domain rules out of their owning domains ([audit])
- ALWAYS: a failed `session-start` responsibility records a diagnostic or omits only the unavailable result while allowing the hook invocation to complete successfully ([audit])
- NEVER: `session-start` writes, appends to, or unsets a variable in the invoking agent's environment, per [`spx/21-infrastructure.enabler/54-hooks.enabler/21-hook-event-runner.pdr.md`](../21-hook-event-runner.pdr.md) ([test](tests/session-start.compliance.l2.test.ts))
