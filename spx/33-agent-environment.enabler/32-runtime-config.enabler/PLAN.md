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

## Settled work

- Runtime config reconciliation is settled on `origin/main`.
- Follow-up runtime-state boundary notes are recorded in the parent agent-environment plan and owning consumer packets.
