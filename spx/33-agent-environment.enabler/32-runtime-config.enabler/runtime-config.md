# Runtime Config

PROVIDES deterministic reconciliation of Claude Code and Codex runtime configuration
SO THAT agent execution launched by spx
CAN use configured local runtime settings without manual setup drift

## Assertions

### Compliance

- ALWAYS: runtime config reconciliation is idempotent for the same resolved config and product directory ([test](tests/runtime-config.scenario.l1.test.ts), [review])
- ALWAYS: Claude Code and Codex settings are modeled as runtime-specific outputs under one agent-environment owner ([test](tests/runtime-config.compliance.l1.test.ts), [review])
- ALWAYS: failed runtime config writes attempt rollback for every attempted runtime file and report aggregate rollback diagnostics when rollback cannot fully restore state ([test](tests/runtime-config.scenario.l1.test.ts), [review])
- ALWAYS: Codex TOML reconciliation preserves unowned TOML content while normalizing the managed `spx.agentEnvironment` state to the managed table form ([test](tests/runtime-config.scenario.l1.test.ts), [review])
- NEVER: mix invoking-agent state with hermetic audit or review execution state ([test](tests/runtime-config.compliance.l1.test.ts), [review])
