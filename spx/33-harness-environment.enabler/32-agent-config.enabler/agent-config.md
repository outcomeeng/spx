# Agent Config

PROVIDES deterministic reconciliation of Claude Code and Codex configuration
SO THAT agent execution launched by spx
CAN use configured local settings without manual setup drift

## Assertions

### Scenarios

- Given the same resolved config and product directory, when agent config reconciliation runs twice, then the second run leaves agent files byte-stable ([test](tests/agent-config.scenario.l1.test.ts))
- Given agent config reconciliation has attempted writes and one write fails, then reconciliation attempts rollback for every attempted agent file and reports aggregate rollback diagnostics when rollback cannot fully restore state ([test](tests/agent-config.scenario.l1.test.ts))
- Given Codex TOML contains unowned content, when agent config reconciliation writes the managed state, then unowned TOML content is preserved and the managed `spx.harnessEnvironment` state is normalized to the managed table form ([test](tests/agent-config.scenario.l1.test.ts))

### Compliance

- ALWAYS: Claude Code and Codex settings are modeled as agent outputs under one harness-environment owner ([test](tests/agent-config.compliance.l1.test.ts))
- ALWAYS: agent config outputs that embed the absolute `productDir` are local agent state, never tracked product files ([audit])
- NEVER: mix invoking-agent state with a hermetic agentic verification run's execution state ([test](tests/agent-config.compliance.l1.test.ts))
