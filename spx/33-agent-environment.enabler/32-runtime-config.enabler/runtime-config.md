# Runtime Config

PROVIDES deterministic reconciliation of Claude Code and Codex runtime configuration
SO THAT agent execution launched by spx
CAN use configured local runtime settings without manual setup drift

## Assertions

### Scenarios

- Given the same resolved config and product directory, when runtime config reconciliation runs twice, then the second run leaves runtime files byte-stable ([test](tests/runtime-config.scenario.l1.test.ts))
- Given a later runtime config write fails, when earlier runtime files were attempted, then reconciliation attempts rollback for every attempted runtime file and reports aggregate rollback diagnostics when rollback cannot fully restore state ([test](tests/runtime-config.scenario.l1.test.ts))
- Given Codex TOML contains unowned content, when runtime config reconciliation writes the managed state, then unowned TOML content is preserved and the managed `spx.harnessEnvironment` state is normalized to the managed table form ([test](tests/runtime-config.scenario.l1.test.ts))

### Compliance

- ALWAYS: Claude Code and Codex settings are modeled as configured-agent outputs under one harness-environment owner ([test](tests/runtime-config.compliance.l1.test.ts))
- ALWAYS: runtime config outputs that embed the absolute `productDir` are local runtime state, never tracked product files ([review])
- NEVER: mix invoking-agent state with a hermetic agentic verification run's execution state ([test](tests/runtime-config.compliance.l1.test.ts))
