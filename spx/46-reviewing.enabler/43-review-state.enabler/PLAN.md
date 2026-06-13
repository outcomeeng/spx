# Plan: Review State

## Purpose

Persist local review observations for status and latest-review lookup.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`
- `spx/15-worktree-management.pdr.md`

## Implementation Notes

- Define review state shape before branch and PR commands write it.
- Store branch review state under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root.
- Include branch and PR target discriminators once PR-scoped state is designed in the state-store contract.
- Reuse the branch slug implementation owned by `spx/18-state.enabler/32-scope-addressing.enabler/` (governed by `spx/17-state.adr.md`) for branch review targets.
- Use canonical review descriptor digest for staleness.
- Keep incomplete run behavior explicit and visible.

## Evidence Required

- State tests cover successful, rejected, failed, interrupted, incomplete, and parse-invalid review runs.
- Storage tests prove branch review state uses the shared `.spx/branch/{branch-slug}/review/` scope.
- Latest lookup tests cover branch targets and PR targets.
- Digest tests prove config changes mark review state stale.

## Parallelization

This can proceed after review config and canonical descriptor digest are available.

## Implementation Ownership

- Own review-state modules, serializers, lookup helpers, and this node's co-located tests required by the review state assertions.
- Store only under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root for branch review state.
- Do not write audit state under `.spx/branch/{branch-slug}/audit/` or reuse audit run files; consume the shared state-store branch slug helpers needed for branch review target names.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/review-state after review config and canonical descriptor digest are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/43-review-state.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/46-reviewing.enabler/21-review-config.enabler/review-config.md` and `git cat-file -e origin/main:spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md` succeed for the R1 and C1 artifacts.

Define and implement persisted branch review state under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root. Include branch target identity, reviewer metadata, base/head identifiers, and canonical review descriptor digest. Prove terminal states, incomplete and parse-invalid runs, latest lookup for branch targets, state-store path composition, and stale state after config digest changes. Open one PR and ask reviewers to audit state shape and storage boundaries.
```
