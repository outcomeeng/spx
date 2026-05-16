# Issues: Runtime Config

## Tracked Follow-Ups

- `src/domains/agent-environment/runtime-config.ts`: managed runtime config state writes the absolute `productDir` into generated Codex and Claude Code runtime files. Decide whether this is intentional persisted runtime state or whether generated local runtime config files need explicit ignore/documentation guidance before broadening runtime config reconciliation beyond local agent execution.
- `src/domains/agent-environment/runtime-config.ts`: hermetic `stateDir` is caller-owned and not validated inside runtime config reconciliation. Before audit or review execution accepts a configured or CLI-derived state directory, the owning hermetic execution packet must validate containment and add evidence at the caller boundary.
