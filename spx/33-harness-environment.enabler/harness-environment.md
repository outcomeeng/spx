# Harness Environment

PROVIDES deterministic management of repository-local harness environment configuration
SO THAT context ingestion, agentic verification, and agent-driven development workflows
CAN run with configured methodology context, instructions, agents, plugin marketplaces, plugins, and skills

## Assertions

### Compliance

- ALWAYS: harness environment management treats `AGENTS.md`, Claude Code configuration, Codex configuration, plugin marketplaces, plugins, and skills as agent inputs ([audit])
- ALWAYS: the `harnessEnvironment` descriptor resolves methodology context, instruction, agent, marketplace, plugin, and skill configuration through the static config registry ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: each agent carries hook policy at `hooks.sessionStart.compactStdout`, with Codex defaulting compact `SessionStart` stdout off and Claude Code defaulting it on ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: configured instruction files, marketplaces, plugins, and skills reference registered agents exported by the descriptor module ([test](tests/harness-environment-descriptor.compliance.l1.test.ts))
- ALWAYS: generated or reconciled harness environment configuration is deterministic for the same product directory and resolved config ([audit])
- ALWAYS: an agentic verification run receives isolated harness environment state rather than mutating the invoking agent's state ([audit])
- NEVER: require network access for core config reconciliation when required marketplaces, plugins, and skills are present locally ([audit])
- NEVER: the parent descriptor performs instruction reconciliation, agent config writes, plugin installation, or network access ([audit])

### Mappings

- Equivalent JSON, YAML, and TOML `harnessEnvironment` sections resolve to identical typed harness environment config ([test](tests/harness-environment-descriptor.mapping.l1.test.ts))
