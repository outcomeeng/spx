---
type: Decision Basis
description: Why the harness environment descriptor is one parent section, rejects unknown fields, and identifies an agent only by the one variable it sets for itself.
---

# Harness environment descriptor: decision basis

This entry records the basis of [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md).

## One parent descriptor

Harness environment management spans `AGENTS.md`, agent configuration, marketplaces, plugins, and skills. One `harnessEnvironment` section gives the downstream children a typed shared input, while their concrete file writes, plugin status classifications (installed, missing, stale, failed), dry-run output, offline behavior, and hermetic state paths stay child-owned; the descriptor validates configured intent only. Strict rejection of unknown fields protects operators from silent typos in a section several children consume: accepting a misspelling makes downstream behavior appear successful while it drops configured intent.

## Identity variables

An agent naming its own session is the only source whose value is authoritative for that agent, so each agent is identified by the variable it sets for itself and by nothing SPX writes. `CLAUDE_SESSION_ID` is a name only SPX's own `session-start` hook exports, so a process the hook did not reach finds no session under it, and `CLAUDE_ENV_FILE` is a hook mechanism rather than a session identity; neither identifies an agent. An agent launched from another inherits the parent's variables, and an agent can publish another agent's variable, so two set identity variables do not say which agent does the work. A precedence order would guess; identifying no agent, and failing a command that needs a session identity with every identity variable it found set named, leaves the choice to the operator. On 2026-11-19 the Operator settled agy's variable, `ANTIGRAVITY_CONVERSATION_ID`, which the agy 1.5.11 binary sets and reads as its conversation id, and the Claude default for methodology source selection when several variables are set.

## Rejected

- Child-owned descriptor sections only: downstream children need a stable parent input before their implementation details settle.
- Agent-specific config file paths in this descriptor: path semantics, dry-run output, and serializer behavior belong to the agent configuration child, which models the shared agent identity and configured entries only.
- A precedence order among the identity variables, or a fallback from one agent's variable to another's: several set variables leave the working agent unknown, and an order guesses it.
