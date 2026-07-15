# Plan: harness environment

## Harness vocabulary guard

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Purpose

Define and implement deterministic management for agent instructions, agent config, plugin marketplaces, plugins, and skills.

## Governing specs

- `spx/spx.product.md`
- `spx/33-harness-environment.enabler/21-agent-instructions.enabler/agent-instructions.md`
- `spx/33-harness-environment.enabler/32-agent-config.enabler/agent-config.md`
- `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/plugin-bootstrap.md`

## Implementation notes

- Make agent config reconciliation deterministic and safe to run repeatedly.
- Keep agentic verification environment bootstrapping hermetically separate from the invoking agent.

## Settled work

- The parent harness-environment descriptor shape is settled on `origin/main`.
- Agent config reconciliation is settled on `origin/main`.
- Agent state boundary notes are recorded for agentic verification consumers.

## Active work

- Deterministic instruction-file reconciliation remains under `spx/33-harness-environment.enabler/21-agent-instructions.enabler/`.
- Plugin marketplace, plugin, and skill bootstrap status remains under `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/`.

## Evidence required

- Tests or review evidence prove generated instruction files are deterministic.
- Tests or review evidence prove plugin bootstrap can distinguish installed, missing, and misconfigured entries.
- `spx validation all` passes.

## Parallelization

Instruction-file reconciliation and plugin bootstrap can proceed independently after agent config reconciliation.

## Open coordination

- Align this node with `spx/12-agent-harness.pdr.md`: distinguish harness configuration from agents, agent adapters, and agent sessions across specs, config contracts, source modules, generators, and tests. The existing agent vocabulary rename belongs here because the descriptor and child reconcilers own that shared vocabulary.
- Author the invoking-agent isolation decision before an agentic verification run's implementation chooses working-directory, environment-variable, or temporary-file sharing boundaries.
- When E1, E2, or E3 add descriptor-consuming tests, expand `CONFIG_TEST_GENERATOR.harnessEnvironmentConfig()` beyond the E0 representative mapping shape or add narrower generator names for shape-specific evidence.

## Gate dependencies

The central packet table in `spx/16-config.enabler/PLAN.md` is authoritative; this section is a local reminder only.

- `spx/33-harness-environment.enabler/21-agent-instructions.enabler/` consumes settled agent config reconciliation.
- `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/` consumes settled agent config reconciliation.

## Agent pickup prompt

```text
Use the child-node pickup prompts for E1 and E3. The parent descriptor and E2 agent config packets are settled on `origin/main`.
```
