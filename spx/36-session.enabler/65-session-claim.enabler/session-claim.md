# Session Claim

PROVIDES atomic pickup and release via filesystem rename() with priority-based auto-selection
SO THAT session-cli enabler
CAN offer `spx session pickup` and `spx session release` commands with guaranteed single-claim semantics

## Assertions

### Scenarios

- Given a session in todo, when pickup is invoked, then the session moves to doing atomically via rename() ([test](tests/session-claim.unit.test.ts))
- Given a claimed session in doing, when release is invoked, then the session moves back to todo ([test](tests/session-claim.unit.test.ts))
- Given sessions with different priorities in todo, when pickup --auto is invoked, then the highest-priority oldest session is claimed ([test](tests/session-claim.unit.test.ts))
- Given a session already claimed by another agent, when a second agent attempts pickup, then the second agent receives SessionNotAvailableError ([test](tests/session-claim.unit.test.ts))

### Properties

- Concurrent pickup of the same session results in exactly one success and all others receiving ENOENT-derived errors ([test](tests/session-claim.integration.test.ts))
- Auto-pickup selection is deterministic: same input sessions always produce the same selection ([test](tests/session-claim.unit.test.ts))
- Current-session resolution is deterministic when session file names do not match the timestamp pattern: sessions with unparsable IDs occupy stable positions relative to valid-ID sessions ([test](tests/session-claim.unit.test.ts))
- Auto-pickup selection is deterministic when session file names do not match the timestamp pattern: sessions with unparsable IDs occupy stable positions relative to valid-ID sessions at the same priority ([test](tests/session-claim.unit.test.ts))

### Compliance

- ALWAYS: use fs.rename() for status transitions per ADR 21-atomic-claiming ([review](../21-atomic-claiming.adr.md))
- NEVER: use read-then-write pattern for claiming per ADR 21-atomic-claiming ([review](../21-atomic-claiming.adr.md))
