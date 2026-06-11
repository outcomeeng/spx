# Plan: Reviewing

## Purpose

Add local hermetic review execution for branch and pull request targets.

## Governing Specs

- `spx/spx.product.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md`
- `spx/46-reviewing.enabler/43-review-state.enabler/review-state.md`
- `spx/46-reviewing.enabler/54-branch-review.enabler/branch-review.md`
- `spx/46-reviewing.enabler/65-pr-review.enabler/pr-review.md`
- `spx/33-agent-environment.enabler/agent-environment.md`

## Implementation Notes

- Keep review behavior local and hermetically separated from the invoking agent.
- Model branch and PR targets separately because their target discovery differs.
- Reuse shared config primitives and agent-environment APIs.
- Persist review state under its own `review` state-store consumer noun inside the shared branch scope.

## Evidence Required

- Descriptor tests cover review defaults, target filters, reviewer selection, and isolation from audit config.
- Execution tests cover branch and PR targets with isolated runtime state.
- State tests cover persisted review outcomes and latest-review lookup.

## Parallelization

Child nodes can split after review config and hermetic execution contracts are agreed.

## Open Coordination

- State-store owns shared branch scope and run-file naming; review state must use its own `review` domain records rather than audit records.
- Implementing agents load `spx/46-reviewing.enabler/` and `spx/33-agent-environment.enabler/` as governing truth; consult `spx/46-claude.outcome/` only as Claude-specific source material for reconciliation work.

## Gate Dependencies

The central packet table in `spx/16-config.enabler/PLAN.md` is authoritative; this section is a local reminder only.

- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/` is gated on `spx/33-agent-environment.enabler/32-runtime-config.enabler/`. Pick up `spx/33-agent-environment.enabler/` E0 and E2 before R2 when resources are available.
