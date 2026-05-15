# Plan: Branch Review

## Purpose

Implement `spx review branch` for local branch targets.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md`
- `spx/46-reviewing.enabler/43-review-state.enabler/review-state.md`

## Implementation Notes

- Resolve current branch, head SHA, base ref, changed paths, and target filters before reviewer launch.
- Do not require GitHub or network metadata.
- Persist findings and terminal review state after reviewer execution.

## Evidence Required

- Scenario tests cover clean branch, changed branch, configured base ref, target filters, and reviewer failure.
- State tests prove branch target metadata is persisted for status lookup.

## Parallelization

This depends on hermetic execution and review state APIs.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/branch-review after hermetic execution and review state APIs are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/54-branch-review.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/hermetic-review-execution.md` and `git ls-tree origin/main -- spx/46-reviewing.enabler/43-review-state.enabler/review-state.md` report the R2 and R3 artifacts.

Implement `spx review branch` for local branch targets. Resolve current branch, head SHA, base ref, changed paths, and target filters before reviewer launch. Avoid GitHub metadata. Persist findings and terminal review state through the shared review state API. Prove clean branch, changed branch, configured base ref, target filters, reviewer failure, and persisted branch target metadata. Open one PR and ask reviewers to audit branch target resolution and offline behavior.
```
