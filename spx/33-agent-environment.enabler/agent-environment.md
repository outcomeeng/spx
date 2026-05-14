# Agent Environment

PROVIDES deterministic management of local agent runtime configuration
SO THAT context ingestion, auditing, reviewing, and agent-driven development workflows
CAN run with configured instructions, runtimes, plugin marketplaces, plugins, and skills

## Assertions

### Compliance

- ALWAYS: agent environment management treats `AGENTS.md`, Claude Code configuration, Codex configuration, plugin marketplaces, plugins, and skills as configured runtime inputs ([review])
- ALWAYS: generated or reconciled agent configuration is deterministic for the same product directory and resolved config ([review])
- ALWAYS: audit and review execution receive isolated agent environment state rather than mutating the invoking agent's state ([review])
- NEVER: require network access for core config reconciliation when required marketplaces, plugins, and skills are present locally ([review])
