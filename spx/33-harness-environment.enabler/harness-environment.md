---
id: 01a1ffbf-9424-7208-91fb-21473659bb17
---

# Harness Environment

PROVIDES deterministic management of repository-local agent harness environment configuration, exact methodology-compatible capability projections, and the registry of the coding agents spx supports
SO THAT context ingestion, agentic verification, and agent-driven development workflows
CAN run with explicitly enabled and available coding agents, identify the invoking agent, and receive version-matched instructions, native agent configuration, capability sources, plugins, and skills

## Test.Compliance: descriptor

- [registry-resolution](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: the `harnessEnvironment` descriptor resolves instruction, agent, marketplace, plugin, and skill configuration through the static config registry.
- [agent-compact-default](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: each agent's config carries `hooks.sessionStart.compactStdout` with an agent-specific default, and an explicit boolean in that agent's configuration overrides it.
- [registered-agent-references](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: configured instruction files, marketplaces, plugins, and skills reference registered agent ids the descriptor module exports.

## Test.Compliance: agent registry

- registry-lists-agents: ALWAYS: the agent registry module lists every agent module, and each agent module declares its agent id, its process name, its hook payload's session field, its compact-stdout default, and at most one methodology bundle.
- one-default-bundle: ALWAYS: exactly one registered agent module marks its methodology bundle as the default methodology bundle, and methodology selection uses it when no agent is identified or the identified agent declares no methodology bundle.
- agent-names-in-registry-only: NEVER: a file under `src/` outside the agent registry module, its agent modules, and the files the rule's transitional allowlist names holds a string literal exactly equal to a registered agent id; comments, the module specifier of an import declaration, and files under `src/lib/methodology/` are out of scope, and the rule's test rejects each violating fixture.
- no-identity-variable: NEVER: the registry's resolver reads an environment variable to identify an agent, and no agent module declares an identity variable.

## Test.Mapping: agent-identification

Every combination of an `--agent` operand, absent or naming an id the agent registry module lists or not, and an ancestor process chain, generated from the registered process names and other executables, maps through the registry's resolver to the identified agent alone; no environment variable takes part.

| Case                 | `--agent` operand         | Ancestor process chain                                        | Identified agent                      |
| -------------------- | ------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| operand              | names a registered agent  | any                                                           | the agent the operand names           |
| unregistered-operand | names no registered agent | any                                                           | none                                  |
| ancestor             | absent                    | holds a process whose executable is a registered process name | the agent of the nearest such process |
| none                 | absent                    | holds no such process                                         | none                                  |

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
- no-agent-named: NEVER: this spec names a coding agent, an agent id, or a process name.
