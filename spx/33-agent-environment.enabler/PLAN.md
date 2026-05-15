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

## Gate Dependencies

- `spx/33-agent-environment.enabler/21-agent-instructions.enabler/` is gated on `spx/33-agent-environment.enabler/32-runtime-config.enabler/`. Assign E2 before E1.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/agent-environment-descriptor. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/33-agent-environment.enabler/. Read this PLAN and the governing child specs it names. Invoke spec-tree:applying, typescript:architecting-typescript if the descriptor shape needs an ADR, spec-tree:testing and typescript:testing-typescript before tests, then typescript:coding-typescript before implementation.

Packet E0 defines the agent environment descriptor shape that E1, E2, and E3 consume. This packet gates E1, E2, and E3, and E2 transitively gates A3, R2, R4, and R5; stabilize and merge E0 before those packets are assigned. E1 additionally gates on E2; do not hand off E1 until E2 merges. Own only the parent `spx/33-agent-environment.enabler/` spec files and descriptor-shape implementation. Do not edit child-node specs or create implementation stubs for E1, E2, or E3. Export shared descriptor types and schema hooks here; leave instruction reconcilers, runtime config resolvers, and plugin bootstrap runners to E1, E2, and E3. Cover instruction fragments, runtime-specific config targets, plugin marketplaces, plugins, skills, offline behavior, and separate paths for invoking-agent state versus hermetic audit/review execution state. Keep runtime-specific serializers in child packets. Open one PR and ask reviewers to audit descriptor ownership, hermetic-state boundaries, and whether E1/E2/E3 have enough stable API to proceed.
```
