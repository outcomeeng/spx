# Plan: Reviewing

## Purpose

Add local hermetic review execution for branch and pull request targets.

## Governing Specs

- `spx/spx.product.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md`
- `spx/46-reviewing.enabler/43-branch-review.enabler/branch-review.md`
- `spx/46-reviewing.enabler/54-pr-review.enabler/pr-review.md`
- `spx/46-reviewing.enabler/65-review-state.enabler/review-state.md`
- `spx/33-agent-environment.enabler/agent-environment.md`

## Implementation Notes

- Keep review behavior local and hermetically separated from the invoking agent.
- Model branch and PR targets separately because their target discovery differs.
- Reuse shared config primitives and agent-environment APIs.
- Persist review state separately from audit state unless a later ADR unifies the storage contract.

## Evidence Required

- Descriptor tests cover review defaults, target filters, reviewer selection, and isolation from audit config.
- Execution tests cover branch and PR targets with isolated runtime state.
- State tests cover persisted review outcomes and latest-review lookup.

## Parallelization

Child nodes can split after review config and hermetic execution contracts are agreed.
