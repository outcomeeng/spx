# Plan: Review State

## Purpose

Persist local review observations for status and latest-review lookup.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`
- `spx/15-worktree-resolution.pdr.md`

## Implementation Notes

- Define review state shape before branch and PR commands write it.
- Store review state under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}` at the Git common-dir product root.
- Include branch and PR target discriminators.
- Reuse the branch slug implementation owned by `spx/36-audit.enabler/15-audit-directory.adr.md` for branch review targets.
- Use canonical review descriptor digest for staleness.
- Keep incomplete run behavior explicit and visible.

## Evidence Required

- State tests cover successful, rejected, failed, interrupted, incomplete, and parse-invalid review runs.
- Storage tests prove branch and PR targets use separate target-kind directories under `.spx/review/`.
- Latest lookup tests cover branch targets and PR targets.
- Digest tests prove config changes mark review state stale.

## Parallelization

This can proceed after review config and canonical descriptor digest are available.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/review-state after review config and canonical descriptor digest are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/43-review-state.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/46-reviewing.enabler/21-review-config.enabler/review-config.md` and `git cat-file -e origin/main:spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md` succeed for the R1 and C1 artifacts.

Define and implement persisted review state under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}` at the Git common-dir product root. Include branch and PR target discriminators, reviewer metadata, base/head identifiers, and canonical review descriptor digest. Prove terminal states, incomplete and parse-invalid runs, latest lookup for branch and PR targets, separate target-kind directories, and stale state after config digest changes. Open one PR and ask reviewers to audit state shape and storage boundaries.
```
