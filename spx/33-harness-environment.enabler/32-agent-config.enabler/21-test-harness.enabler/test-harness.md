# Agent Config Test Harness

PROVIDES harness-environment agent-config test fixtures — a both-agents-enabled `HarnessEnvironmentConfig` builder, a navigator that reads the managed harness-environment record out of a parsed `.spx` agent-config state, and a record reader that validates a value is a plain object or rejects it
SO THAT the agent-config enabler's L1 tests
CAN assert over an enabled harness config and a parsed state record without rebuilding the config defaults or the nested-record traversal, and exercise the reader's reject path

## Assertions

### Scenarios

- Given the enabled-environment builder, when it runs, then the returned config enables both the Codex and Claude Code agents over the descriptor defaults ([test](tests/test-harness.scenario.l1.test.ts))
- Given a parsed agent-config state record nesting the managed harness-environment record under the `spx` field, when the managed-state navigator reads it, then the inner harness-environment record is returned ([test](tests/test-harness.scenario.l1.test.ts))
- Given a value that is a plain object, when the record reader runs, then the value is returned; given a non-object, a null, or an array, then the reader throws ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the enabled-environment builder composes the production `harnessEnvironmentConfigDescriptor` defaults and `AGENT` keys rather than literal agent names, so the fixture tracks the production agent set ([audit])
