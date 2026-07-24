# Agent Config

PROVIDES deterministic reconciliation of repository-local native configuration for participating Claude Code, Codex, and Pi coding agents
SO THAT coding-agent execution launched or prepared by spx
CAN use exact configured local projections without manual setup drift or user-scope mutation

## Assertions

### Scenarios

- Given the same resolved config and product directory, when agent config reconciliation runs twice, then the second run leaves agent files byte-stable ([test](tests/agent-config.scenario.l1.test.ts))
- Given coding-agent config reconciliation has attempted writes and one write fails, then reconciliation attempts rollback for every attempted native agent file and reports aggregate rollback diagnostics when rollback cannot fully restore state ([test](tests/agent-config.scenario.l1.test.ts))
- Given Codex TOML contains unowned content, when agent config reconciliation writes the managed state, then unowned TOML content is preserved and the managed `spx.harnessEnvironment` state is normalized to the managed table form ([test](tests/agent-config.scenario.l1.test.ts))

### Compliance

- ALWAYS: Claude Code and Codex native settings are modeled as coding-agent outputs under one harness-environment owner ([test](tests/agent-config.compliance.l1.test.ts))
- ALWAYS: coding-agent config outputs that embed the absolute `productDir` are local coding-agent state, never tracked product files ([audit])
- NEVER: coding-agent config reconciliation selects capability versions, changes methodology identity, or mutates user-scope coding-agent configuration; it consumes resolved product-scoped projections ([audit])
- NEVER: mix invoking-agent state with a hermetic agentic verification run's execution state ([test](tests/agent-config.compliance.l1.test.ts))
