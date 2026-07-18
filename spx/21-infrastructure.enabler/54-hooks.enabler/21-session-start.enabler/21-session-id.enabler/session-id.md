# Session ID

PROVIDES session identity resolution for the `session-start` hook event — using
the hook payload and runtime environment to select the agent session id written
to hook exports and worktree occupancy state
SO THAT session-start dependents
CAN share one session identity across hook runtime state and SPX state

## Assertions

### Scenarios

- Given the `session-start` payload has no session id and the hook environment contains `CODEX_THREAD_ID`, when the hook runs, then SPX uses `CODEX_THREAD_ID` as the session id and writes it to the hook env file ([test](tests/session-id.scenario.l1.test.ts))
- Given the hook environment contains both `CLAUDE_SESSION_ID` and `CODEX_THREAD_ID`, when the `session-start` payload has no session id, then SPX uses `CLAUDE_SESSION_ID` as the session id and writes it to the hook env file ([test](tests/session-id.scenario.l1.test.ts))
- Given the `session-start` payload contains a session id and the hook environment also contains `CLAUDE_SESSION_ID`, when the hook runs, then SPX uses the payload session id and writes it to the hook env file ([test](tests/session-id.scenario.l1.test.ts))
- Given a Pi `session-start` payload contains the exact native transcript path but no session id, and that transcript opens with a valid Pi session header whose cwd matches the payload product directory, when the hook runs, then SPX uses the header session id as the hook session identity ([test](tests/session-id.scenario.l1.test.ts))

### Mappings

- Pi native-session evidence maps to no session identity and no worktree claim with its source-owned diagnostic when the exact transcript path is absent, resolves outside the configured Pi session store, cannot be read, has a malformed Pi header, or identifies a cwd different from the payload product directory ([test](tests/session-id.mapping.l1.test.ts))

### Compliance

- NEVER: `session-start` reads Pi transcript opening metadata when the exact payload path resolves outside the canonical configured Pi session-store root; the hook rejects that path before the bounded read and produces no session identity or worktree claim ([test](tests/session-id.compliance.l1.test.ts))
