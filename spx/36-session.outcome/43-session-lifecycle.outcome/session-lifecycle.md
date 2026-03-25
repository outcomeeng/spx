# Session Lifecycle

WE BELIEVE THAT providing atomic `spx session pickup` and `spx session release` commands with priority-based auto-selection
WILL cause agents to claim and release sessions without risk of double-claiming or lost handoffs
CONTRIBUTING TO reliable multi-agent coordination and uninterrupted engineering workflows

## Assertions

### Scenarios

- Given a session in todo, when `spx session pickup <id>` is invoked, then the session moves to doing atomically via `rename()` ([test](tests/session-lifecycle.unit.test.ts))
- Given a claimed session in doing, when `spx session release` is invoked, then the session moves back to todo ([test](tests/session-lifecycle.unit.test.ts))
- Given sessions with different priorities in todo, when `spx session pickup --auto` is invoked, then the highest-priority oldest session is claimed ([test](tests/session-lifecycle.unit.test.ts))
- Given a session already claimed by another agent, when a second agent attempts pickup, then the second agent receives `SessionNotAvailableError` ([test](tests/session-lifecycle.unit.test.ts))

### Properties

- Concurrent pickup of the same session results in exactly one success and all others receiving ENOENT-derived errors ([test](tests/session-lifecycle.integration.test.ts))
- Auto-pickup selection is deterministic: same input sessions always produce the same selection ([test](tests/session-lifecycle.unit.test.ts))

### Compliance

- ALWAYS: use `fs.rename()` for status transitions per ADR `21-atomic-claiming` ([review](../21-atomic-claiming.adr.md))
- NEVER: use read-then-write pattern for claiming per ADR `21-atomic-claiming` ([review](../21-atomic-claiming.adr.md))
