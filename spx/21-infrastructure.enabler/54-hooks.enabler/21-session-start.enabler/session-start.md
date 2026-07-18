# Session Start

PROVIDES the `session-start` hook event orchestration — resolving the agent
session identity, writing hook-runtime exports, establishing worktree occupancy,
and routing compact lifecycle stdout policy
SO THAT installed agent plugins
CAN establish session continuity through one lifecycle hook invocation

## Assertions

### Scenarios

- Given `spx hook run session-start` receives a payload with a product directory and session identity, when the hook runtime supplies an env-file path, worktree scope, and controlling process context, then SPX exits successfully, appends the session and project exports, exports `SPX_WORKTREE_CLAIM_PATH`, and writes a readable worktree claim record carrying the session id, pid, host, and start time ([test](tests/session-start.scenario.l2.test.ts))
- Given `spx hook run session-start` receives a Pi payload with a product directory and exact native transcript path whose opening header identifies that directory and session, when the hook runtime supplies worktree scope and controlling process context, then SPX exits successfully, claims the linked worktree under the Pi session id, and `spx worktree status --format json` reports that running holder identity ([test](tests/session-start.scenario.l2.test.ts))

### Mappings

- At the packaged CLI boundary, an absent Pi transcript path, a path outside the configured Pi session store, an unreadable trusted path, malformed Pi header, or product-directory mismatch maps to degraded successful completion with the matching source-owned diagnostic, no exported session identity, and `free` worktree status ([test](tests/session-start-rejection.mapping.l2.test.ts))

### Compliance

- ALWAYS: the first required event operand is `session-start`, matching the lowercase hyphenated hook-runner naming used by established hook tools ([test](tests/session-start.compliance.l2.test.ts))
- ALWAYS: `session-start` coordinates session identity, worktree claiming, hook env-file writes, and compact lifecycle stdout policy without moving the underlying domain rules out of their owning domains ([audit])
- ALWAYS: a failed `session-start` responsibility records a diagnostic or omits only the unavailable export while allowing the hook invocation to complete successfully ([audit])
