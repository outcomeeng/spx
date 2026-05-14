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

## Evidence Required

- Tests or review evidence prove generated instruction files are deterministic.
- Tests or review evidence prove runtime config reconciliation is idempotent.
- Tests or review evidence prove plugin bootstrap can distinguish installed, missing, and misconfigured entries.
- `spx validation all` passes.

## Parallelization

The three child nodes can proceed independently after their shared config shape is agreed.

## Open Coordination

- Author the invoking-agent isolation decision before auditor execution or reviewer execution implementation chooses working-directory, environment-variable, or temporary-file sharing boundaries.
