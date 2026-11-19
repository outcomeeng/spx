---
id: 01a1f5a1-eeb8-7080-9128-afc2dfb8cdb4
---

# Harness Environment

PROVIDES deterministic management of repository-local agent harness environment configuration and exact methodology-compatible capability projections
SO THAT context ingestion, agentic verification, and agent-driven development workflows
CAN run with explicitly enabled and available coding agents, version-matched instructions, native agent configuration, capability sources, plugins, and skills

## Assertions

### Test.Compliance: descriptor

- [registry-resolution](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: the `harnessEnvironment` descriptor resolves instruction, agent, marketplace, plugin, and skill configuration through the static config registry.
- [agent-hook-policy-defaults](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: each agent carries hook policy at `hooks.sessionStart.compactStdout`, with Codex, agy, and Pi defaulting compact `SessionStart` stdout off and Claude Code defaulting it on.
- [registered-agent-references](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: configured instruction files, marketplaces, plugins, and skills reference registered agents exported by the descriptor module.
- [registered-agent-identities](tests/harness-environment-descriptor.compliance.l1.test.ts): ALWAYS: the descriptor module registers Claude Code, Codex, agy, and Pi with their agent ids and their identity variables, `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, and `PI_SESSION_ID`.

### Test.Mapping: [config-format-equivalence](tests/harness-environment-descriptor.mapping.l1.test.ts)

Equivalent `harnessEnvironment` sections declared in each config file format resolve to identical typed harness environment config.

| Case | Config file       | Resolved config                                 |
| ---- | ----------------- | ----------------------------------------------- |
| json | `spx.config.json` | identical to the config the other formats yield |
| yaml | `spx.config.yaml` | identical to the config the other formats yield |
| toml | `spx.config.toml` | identical to the config the other formats yield |

### Test.Mapping: [agent-identification](tests/agent-identification.mapping.l1.test.ts)

Every subset of the four identity variables, generated from the source-owned identity-variable keys, with its members non-empty and every other identity variable empty or absent, maps to the identified agent and session, whatever `CLAUDE_SESSION_ID` and `CLAUDE_ENV_FILE` hold.

| Case             | Non-empty identity variables                                                                | Identified agent and session                       |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| none             | none                                                                                        | no agent, no session                               |
| claude-code      | `CLAUDE_CODE_SESSION_ID`                                                                    | Claude Code, the value of `CLAUDE_CODE_SESSION_ID` |
| codex            | `CODEX_THREAD_ID`                                                                           | Codex, the value of `CODEX_THREAD_ID`              |
| agy              | `ANTIGRAVITY_CONVERSATION_ID`                                                               | agy, the value of `ANTIGRAVITY_CONVERSATION_ID`    |
| pi               | `PI_SESSION_ID`                                                                             | Pi, the value of `PI_SESSION_ID`                   |
| claude-codex     | `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`                                                 | no agent, no session                               |
| claude-agy       | `CLAUDE_CODE_SESSION_ID`, `ANTIGRAVITY_CONVERSATION_ID`                                     | no agent, no session                               |
| claude-pi        | `CLAUDE_CODE_SESSION_ID`, `PI_SESSION_ID`                                                   | no agent, no session                               |
| codex-agy        | `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`                                            | no agent, no session                               |
| codex-pi         | `CODEX_THREAD_ID`, `PI_SESSION_ID`                                                          | no agent, no session                               |
| agy-pi           | `ANTIGRAVITY_CONVERSATION_ID`, `PI_SESSION_ID`                                              | no agent, no session                               |
| claude-codex-agy | `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`                  | no agent, no session                               |
| claude-codex-pi  | `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `PI_SESSION_ID`                                | no agent, no session                               |
| claude-agy-pi    | `CLAUDE_CODE_SESSION_ID`, `ANTIGRAVITY_CONVERSATION_ID`, `PI_SESSION_ID`                    | no agent, no session                               |
| codex-agy-pi     | `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, `PI_SESSION_ID`                           | no agent, no session                               |
| all-four         | `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, `PI_SESSION_ID` | no agent, no session                               |

### Audit: harness environment

- coding-agent-inputs: ALWAYS: harness environment management treats `AGENTS.md`, coding-agent-native configuration, capability sources, plugins, and skills as coding-agent inputs.
- deterministic-reconciliation: ALWAYS: generated or reconciled harness environment configuration is deterministic for the same product directory and resolved config.
- isolated-verification-state: ALWAYS: an agentic verification run receives isolated harness environment state rather than mutating the invoking agent's state.
- offline-core-reconciliation: NEVER: core config reconciliation requires network access when the required marketplaces, plugins, and skills are present locally.
- parent-descriptor-effects: NEVER: the parent descriptor performs instruction reconciliation, agent config writes, plugin installation, or network access.
