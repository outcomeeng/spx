# Plan: PR Review

## Purpose

Implement `spx review pr <number>` for local hermetic PR review targets.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md`
- `spx/46-reviewing.enabler/65-review-state.enabler/review-state.md`

## Implementation Notes

- Resolve PR metadata through an injected boundary so tests can use deterministic fixtures.
- Keep remote mutation out of this node.
- Reuse branch review execution once metadata has produced a base/head target.
- Persist PR target metadata with review outputs.

## Evidence Required

- Scenario tests cover valid PR, missing PR, metadata fetch failure, target filters, and reviewer failure.
- Boundary tests prove remote calls are injected and not hardcoded in core review logic.

## Parallelization

This depends on hermetic execution and review state APIs. It can proceed in parallel with branch review after those contracts exist.
