# Runtime Config

PROVIDES deterministic reconciliation of Claude Code and Codex runtime configuration
SO THAT agent execution launched by spx
CAN use configured local runtime settings without manual setup drift

## Assertions

### Compliance

- ALWAYS: runtime config reconciliation is idempotent for the same resolved config and product directory ([review])
- ALWAYS: Claude Code and Codex settings are modeled as runtime-specific outputs under one agent-environment owner ([review])
- NEVER: mix invoking-agent state with hermetic audit or review execution state ([review])
