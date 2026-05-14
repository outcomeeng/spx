# Plan: Branch Review

## Purpose

Implement `spx review branch` for local branch targets.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md`
- `spx/46-reviewing.enabler/65-review-state.enabler/review-state.md`

## Implementation Notes

- Resolve current branch, head SHA, base ref, changed paths, and target filters before reviewer launch.
- Do not require GitHub or network metadata.
- Persist findings and terminal review state after reviewer execution.

## Evidence Required

- Scenario tests cover clean branch, changed branch, configured base ref, target filters, and reviewer failure.
- State tests prove branch target metadata is persisted for status lookup.

## Parallelization

This depends on hermetic execution and review state APIs.
