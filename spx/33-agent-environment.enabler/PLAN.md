# Plan: Agent Environment

## Purpose

Define and implement deterministic management for agent instructions, runtime config, plugin marketplaces, plugins, and skills.

## Governing Specs

- `spx/spx.product.md`
- `spx/33-agent-environment.enabler/21-agent-instructions.enabler/agent-instructions.md`
- `spx/33-agent-environment.enabler/32-runtime-config.enabler/runtime-config.md`
- `spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler/plugin-bootstrap.md`

## Implementation Notes

- Keep this node broader than the Claude-only outcome subtree.
- Treat `spx/46-claude.outcome/` as Claude-specific source material for reconciling runtime configuration and instruction-management assumptions into this node; it does not own agent-environment product truth.
- Make runtime config reconciliation deterministic and safe to run repeatedly.
- Keep audit/review environment bootstrapping hermetically separate from the invoking agent.

## Settled work

- The parent agent-environment descriptor shape is settled on `origin/main`.
- Runtime config reconciliation is settled on `origin/main`.
- Runtime-state boundary notes are recorded for audit and review consumers.

## Active work

- Deterministic instruction-file reconciliation remains under `spx/33-agent-environment.enabler/21-agent-instructions.enabler/`.
- Plugin marketplace, plugin, and skill bootstrap status remains under `spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler/`.
- `spx/46-claude.outcome/` reconciliation waits until instruction-file reconciliation and plugin bootstrap settle.

## Evidence Required

- Tests or review evidence prove generated instruction files are deterministic.
- Tests or review evidence prove plugin bootstrap can distinguish installed, missing, and misconfigured entries.
- `spx validation all` passes.

## Parallelization

Instruction-file reconciliation and plugin bootstrap can proceed independently after runtime config reconciliation.

## Open Coordination

- Author the invoking-agent isolation decision before auditor execution or reviewer execution implementation chooses working-directory, environment-variable, or temporary-file sharing boundaries.
- When E1, E2, or E3 add descriptor-consuming tests, expand `CONFIG_TEST_GENERATOR.agentEnvironmentConfig()` beyond the E0 representative mapping shape or add narrower generator names for shape-specific evidence.

## Gate Dependencies

The central packet table in `spx/16-config.enabler/PLAN.md` is authoritative; this section is a local reminder only.

- `spx/33-agent-environment.enabler/21-agent-instructions.enabler/` consumes settled runtime config reconciliation.
- `spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler/` consumes settled runtime config reconciliation.

## Agent Pickup Prompt

```text
Use the child-node pickup prompts for E1 and E3. The parent descriptor and E2 runtime-config packets are settled on `origin/main`.
```
