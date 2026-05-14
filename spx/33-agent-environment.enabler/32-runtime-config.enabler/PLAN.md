# Plan: Runtime Config

## Purpose

Reconcile Claude Code and Codex runtime configuration from a configured product state.

## Governing Specs

- `spx/33-agent-environment.enabler/agent-environment.md`
- `spx/33-agent-environment.enabler/21-agent-instructions.enabler/agent-instructions.md`

## Implementation Notes

- Reuse useful behavior from the Claude settings subtree only after revalidating it against current product truth.
- Separate runtime-specific serializers from shared policy resolution.
- Keep dry-run or preview behavior deterministic if exposed.
- Do not add compatibility names for command paths without a current spec.

## Evidence Required

- Tests cover read, reconcile, write, dry-run, idempotency, and invalid config diagnostics.
- Tests cover separate output paths for invoking-agent state and hermetic execution state.

## Parallelization

Can proceed in parallel with instruction management, but review/audit execution should consume this only after its public API stabilizes.

## Agent Pickup Prompt

```text
Start from fresh origin/main on work/agent-runtime-config after the agent environment descriptor shape is stable. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/33-agent-environment.enabler/32-runtime-config.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/33-agent-environment.enabler/` reports the E0 descriptor-shape artifacts. Implement deterministic Claude Code and Codex runtime config reconciliation. Separate runtime-specific serializers from shared policy resolution, keep dry-run output deterministic, and keep invoking-agent state separate from hermetic audit/review execution state. Prove read, reconcile, write, dry-run, idempotency, invalid config diagnostics, and separate output paths. Open one PR and ask reviewers to audit runtime boundary safety.
```
