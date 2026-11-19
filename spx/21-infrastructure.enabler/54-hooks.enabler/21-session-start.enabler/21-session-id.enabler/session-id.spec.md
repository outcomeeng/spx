---
id: 01a1f5b1-49fa-7286-b5df-13949e54a78e
---

# Session ID

PROVIDES session identity resolution for the `session-start` hook event — using
the hook payload and runtime environment to select the agent session id written
to hook exports and worktree occupancy state
SO THAT session-start dependents
CAN share one session identity across hook runtime state and SPX state

## Assertions

### Test.Scenario: session identity

- [environment-session-single](tests/session-id.scenario.l1.test.ts):
  - Given the `session-start` payload has no session id and exactly one of `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, and `PI_SESSION_ID` is non-empty
  - When the hook runs
  - Then SPX uses that variable's value as the session id
- [environment-session-none-or-several](tests/session-id.scenario.l1.test.ts):
  - Given the `session-start` payload has no session id and none, or two or more, of the four identity variables are non-empty
  - When the hook runs
  - Then SPX resolves no session id and writes no worktree claim
- [payload-session-precedence](tests/session-id.scenario.l1.test.ts):
  - Given the `session-start` payload contains a session id and the hook environment also contains an identity variable naming another session
  - When the hook runs
  - Then SPX uses the payload session id
- [pi-transcript-header-identity](tests/session-id.scenario.l1.test.ts):
  - Given a Pi `session-start` payload contains the exact native transcript path but no session id, and that transcript opens with a valid Pi session header whose cwd matches the payload product directory
  - When the hook runs
  - Then SPX uses the header session id as the hook session identity

### Test.Mapping: [pi-evidence-rejection](tests/session-id.mapping.l1.test.ts)

Pi native-session evidence that fails one condition maps to no session identity and no worktree claim, with the source-owned diagnostic of that condition.

| Case             | Pi native-session evidence                                         | Outcome                               |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------- |
| absent-path      | the exact transcript path is absent                                | no identity, no claim, its diagnostic |
| outside-store    | the path resolves outside the configured Pi session store          | no identity, no claim, its diagnostic |
| unreadable       | the transcript cannot be read                                      | no identity, no claim, its diagnostic |
| malformed-header | the transcript has a malformed Pi header                           | no identity, no claim, its diagnostic |
| cwd-mismatch     | the header identifies a cwd different from the payload product dir | no identity, no claim, its diagnostic |

### Test.Compliance: transcript reads

- [no-read-outside-pi-store](tests/session-id.compliance.l1.test.ts): NEVER: `session-start` reads Pi transcript opening metadata when the exact payload path resolves outside the canonical configured Pi session-store root; the hook rejects that path before the bounded read and produces no session identity or worktree claim.
