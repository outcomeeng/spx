---
id: 01a1ffbf-9424-7208-91fb-21473659bb17
---

# Harness Environment

PROVIDES deterministic management of repository-local agent harness environment configuration, exact methodology-compatible capability projections, and the registry of the coding agents spx supports
SO THAT context ingestion, agentic verification, and agent-driven development workflows
CAN run with explicitly enabled and available coding agents, identify the invoking agent and its session, and receive version-matched instructions, native agent configuration, capability sources, plugins, and skills

## Test.Compliance: descriptor

- [registry-resolution](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: the `harnessEnvironment` descriptor resolves instruction, agent, marketplace, plugin, and skill configuration through the static config registry.
- [agent-compact-default](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: each registered agent's config carries `hooks.sessionStart.compactStdout`, defaulting to the compact-stdout default its agent module declares.
- [registered-agent-references](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: configured instruction files, marketplaces, plugins, and skills reference agent ids the agent registry module exports.

## Test.Compliance: agent registry

- registry-lists-agents: ALWAYS: the agent registry module in `src/lib/agent-environment/` lists every agent module under `src/lib/agent-environment/agents/`, and each agent module declares its agent id, exactly one identity variable, its compact-stdout default, and at most one methodology bundle.
- one-default-bundle: ALWAYS: exactly one registered agent module marks its methodology bundle as the default methodology bundle, and methodology selection uses it when two or more registered identity variables are non-empty.
- agent-names-in-registry-only: NEVER: a file under `src/` outside the agent registry module, its agent modules, and the files the rule's transitional allowlist names holds a string literal exactly equal to a registered agent id or to a variable name an agent module declares; comments, the module specifier of an import declaration, and files under `src/lib/methodology/` are out of scope, and the rule's test rejects each violating fixture.

## Test.Mapping: agent-identification

Every subset of the registered identity variables, generated from the agent registry module, with its members non-empty and every other registered identity variable empty, whitespace-only, or absent, maps through the registry's resolver to the identified agent and session by the subset's size and membership alone; no variable takes precedence over another.

| Case    | Non-empty registered identity variables | Identified agent                   | Session                                                           |
| ------- | --------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| none    | none                                    | none                               | none                                                              |
| one     | exactly one                             | the agent whose module declares it | that variable's value, normalized to the safe agent session token |
| several | two or more                             | none                               | none                                                              |

## Test.Mapping: [config-format-equivalence](tests/harness-environment-descriptor.mapping.l1.test.ts)

Equivalent `harnessEnvironment` sections declared in each config file format resolve to identical typed harness environment config.

| Case | Config file       | Resolved config                                 |
| ---- | ----------------- | ----------------------------------------------- |
| json | `spx.config.json` | identical to the config the other formats yield |
| yaml | `spx.config.yaml` | identical to the config the other formats yield |
| toml | `spx.config.toml` | identical to the config the other formats yield |

## Audit: harness environment

- coding-agent-inputs: ALWAYS: harness environment management treats `AGENTS.md`, coding-agent-native configuration, capability sources, plugins, and skills as coding-agent inputs.
- deterministic-reconciliation: ALWAYS: generated or reconciled harness environment configuration is deterministic for the same product directory and resolved config.
- isolated-verification-state: ALWAYS: an agentic verification run receives isolated harness environment state rather than mutating the invoking agent's state.
- offline-core-reconciliation: NEVER: core config reconciliation requires network access when the required marketplaces, plugins, and skills are present locally.
- parent-descriptor-effects: NEVER: the parent descriptor performs instruction reconciliation, agent config writes, plugin installation, or network access.
- no-agent-named: NEVER: this spec names a coding agent, an agent id, or an identity variable.
