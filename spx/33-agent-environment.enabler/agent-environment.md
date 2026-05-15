# Agent Environment

PROVIDES deterministic management of local agent runtime configuration
SO THAT context ingestion, auditing, reviewing, and agent-driven development workflows
CAN run with configured instructions, runtimes, plugin marketplaces, plugins, and skills

## Assertions

### Compliance

- ALWAYS: agent environment management treats `AGENTS.md`, Claude Code configuration, Codex configuration, plugin marketplaces, plugins, and skills as configured runtime inputs ([review])
- ALWAYS: the `agentEnvironment` descriptor resolves instruction, runtime, marketplace, plugin, and skill configuration through the static config registry ([test](tests/agent-environment-descriptor.compliance.l1.test.ts), [review])
- ALWAYS: configured instruction files, marketplaces, plugins, and skills reference registered agent runtimes exported by the descriptor module ([test](tests/agent-environment-descriptor.compliance.l1.test.ts), [review])
- ALWAYS: generated or reconciled agent configuration is deterministic for the same product directory and resolved config ([review])
- ALWAYS: audit and review execution receive isolated agent environment state rather than mutating the invoking agent's state ([review])
- NEVER: require network access for core config reconciliation when required marketplaces, plugins, and skills are present locally ([review])
- NEVER: the parent descriptor performs instruction reconciliation, runtime config writes, plugin installation, or network access ([review](21-agent-environment-descriptor.adr.md))

### Mappings

- Equivalent JSON, YAML, and TOML `agentEnvironment` sections resolve to identical typed agent environment config ([test](tests/agent-environment-descriptor.mapping.l1.test.ts))
