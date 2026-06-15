# Plan: Review State

## Purpose

Persist local review observations for status and latest-review lookup.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`
- `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md`
- `spx/18-state.enabler/71-appendable-journal-store.enabler/appendable-journal-store.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`
- `spx/15-worktree-management.pdr.md`

## Implementation Notes

- Bind each review run to the appendable journal store and fold the `ReviewRunState` projection, per `spx/46-reviewing.enabler/15-review-directory.adr.md` — review runs are append-only event journals, not write-once terminal records.
- Store branch review state under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` and PR review state under `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root.
- Reuse the branch slug implementation owned by `spx/18-state.enabler/32-scope-addressing.enabler/` (governed by `spx/17-state.adr.md`) for branch review targets.
- Use canonical review descriptor digest for staleness.
- Gate terminal evidence on the seal marker; keep unsealed and corrupt-journal runs visible as incomplete.

## Evidence Required

- State tests cover approved, rejected, failed, and interrupted terminal runs, plus unsealed and corrupt journals folding to incomplete.
- Storage tests prove branch review state uses the shared `.spx/branch/{branch-slug}/review/` scope.
- Storage tests prove pull-request review state uses the `.spx/branch/pr-{number}/review/` scope at the Git common-dir product root.
- Latest lookup tests cover branch targets and PR targets.
- Digest tests prove config changes mark review state stale.

## Parallelization

This can proceed after review config and canonical descriptor digest are available.

## Implementation Ownership

- Own review-state modules, serializers, lookup helpers, and this node's co-located tests required by the review state assertions.
- Store branch review state under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` and pull-request review state under `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl`, both at the Git common-dir product root.
- Do not write audit state under `.spx/branch/{branch-slug}/audit/` or reuse audit run files; consume the shared state-store branch slug helpers needed for branch review target names.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/review-state after review config and canonical descriptor digest are available. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/43-review-state.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git cat-file -e origin/main:spx/46-reviewing.enabler/21-review-config.enabler/review-config.md` and `git cat-file -e origin/main:spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md` succeed for the R1 and C1 artifacts.

Define and implement persisted review state as an append-only journal for both branch targets (`.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl`) and pull-request targets (`.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl`) at the Git common-dir product root, folding the `ReviewRunState` projection. Include target identity (branch and PR), reviewer metadata, base/head identifiers, and canonical review descriptor digest. Prove terminal states, unsealed runs and runs whose sealed journal holds no terminal-completion event (corrupt or incomplete journals), latest lookup for branch and pull-request targets, state-store path composition, and stale state after config digest changes. Open one PR and ask reviewers to audit state shape and storage boundaries.
```
