# Harness Environment

PROVIDES deterministic management of repository-local agent harness environment configuration and exact methodology-compatible capability projections
SO THAT context ingestion, agentic verification, and agent-driven development workflows
CAN run with explicitly enabled and available coding agents, version-matched instructions, native agent configuration, capability sources, plugins, and skills

## Assertions

### Compliance

- ALWAYS: harness environment management treats `AGENTS.md`, coding-agent-native configuration, capability sources, plugins, and skills as coding-agent inputs ([audit])
- ALWAYS: a registered coding agent participates only when product configuration explicitly enables it and availability detection finds it; detection alone never opts an agent in ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: resolved harness capability intent carries declared sources and exact package versions for deterministic native projection to each participating coding agent ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: the `harnessEnvironment` descriptor resolves instruction, agent, marketplace, plugin, and skill configuration through the static config registry ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: each agent carries hook policy at `hooks.sessionStart.compactStdout`, with Codex defaulting compact `SessionStart` stdout off and Claude Code defaulting it on ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: configured instruction files, marketplaces, plugins, and skills reference registered agents exported by the descriptor module ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: generated or reconciled harness environment configuration is deterministic for the same product directory and resolved config ([audit])
- ALWAYS: harness capability status is read-only, apply reproduces exact committed versions, and update selects only declared-methodology-compatible versions without changing methodology identity ([audit])
- NEVER: harness environment management mutates user-scope coding-agent configuration ([audit])
- ALWAYS: an agentic verification run receives isolated harness environment state rather than mutating the invoking agent's state ([audit])
- NEVER: the `harnessEnvironment` descriptor resolves methodology source or version; those fields belong to top-level `methodology` config ([test](../16-config.enabler/43-methodology-config.enabler/tests/methodology-config.compliance.l1.test.ts))
- NEVER: require network access for core config reconciliation when required marketplaces, plugins, and skills are present locally ([audit])
- NEVER: the parent descriptor performs instruction reconciliation, agent config writes, plugin installation, or network access ([audit])

### Mappings

- Equivalent JSON, YAML, and TOML `harnessEnvironment` sections resolve to identical typed harness environment config ([test](tests/harness-environment-descriptor.mapping.l1.test.ts))
