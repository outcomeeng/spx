# Plan: PR Review

## Purpose

Implement `spx review pr <number>` for local hermetic PR review targets.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md`
- `spx/46-reviewing.enabler/43-review-state.enabler/review-state.md`

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

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/pr-review after hermetic execution and review state APIs are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/65-pr-review.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md` and `git cat-file -e origin/main:spx/46-reviewing.enabler/43-review-state.enabler/review-state.md` succeed for the R2 and R3 artifacts.

Implement `spx review pr <number>` through an injected PR-metadata boundary so tests use deterministic fixtures. Keep remote mutation out of this node. Convert PR metadata into a base/head target that uses the R2 hermetic execution substrate directly; do not import from or depend on the R4 branch command module. Persist PR target metadata with review outputs. Prove valid PR, missing PR, metadata fetch failure, target filters, reviewer failure, and injected remote-call boundaries. Open one PR and ask reviewers to audit hermetic PR metadata handling.
```
