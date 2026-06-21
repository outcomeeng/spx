# Runtime-Config Test Harness

PROVIDES agent-environment runtime-config test fixtures — a both-runtimes-enabled `AgentEnvironmentConfig` builder, a navigator that reads the managed agent-environment record out of a parsed `.spx` runtime-config state, and a record reader that validates a value is a plain object or rejects it
SO THAT the runtime-config enabler's L1 tests
CAN assert over an enabled-runtime config and a parsed state record without rebuilding the config defaults or the nested-record traversal, and exercise the reader's reject path

## Assertions

### Scenarios

- Given the enabled-environment builder, when it runs, then the returned config enables both the Codex and Claude Code runtimes over the descriptor defaults ([test](tests/test-harness.scenario.l1.test.ts))
- Given a parsed runtime-config state record nesting the managed agent-environment record under the `spx` field, when the managed-state navigator reads it, then the inner agent-environment record is returned ([test](tests/test-harness.scenario.l1.test.ts))
- Given a value that is a plain object, when the record reader runs, then the value is returned; given a non-object, a null, or an array, then the reader throws ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the enabled-environment builder composes the production `agentEnvironmentConfigDescriptor` defaults and `AGENT_RUNTIME` keys rather than literal runtime names, so the fixture tracks the production runtime set ([audit])
