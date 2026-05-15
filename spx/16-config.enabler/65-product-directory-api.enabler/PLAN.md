# Plan: Product Directory API

## Purpose

Rename config and descriptor-facing tracked product-root APIs to `productDir`.

## Governing Specs

- `spx/16-config.enabler/config.md`
- `spx/16-config.enabler/21-descriptor-registration.adr.md`
- `spx/22-test-environment.enabler/test-environment.md`
- `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/spec-tree-fixtures.md`

## Implementation Notes

- Rename config CLI dependency names, config test generators, harness fields, and spec text in one coherent pass.
- Rename root-resolution helper names with ambiguous vocabulary, such as `detectMainRepoRoot`, to Git common-dir product-root vocabulary.
- Do not add `projectRoot` or `projectDir` aliases.
- Keep non-product root-directory names only in text that is deleted in the same branch.

## Evidence Required

- Config and descriptor tests use `productDir` in public helper names and assertions.
- Session root resolver tests use Git common-dir product-root vocabulary after the root-helper rename.
- Repository searches show no added `projectRoot` or `projectDir` call sites in the edited APIs.
- `spx validation all` and full tests pass.

## Parallelization

This should be a focused rename PR because it touches many tests and helper imports.

## Implementation Ownership

- Own only product-root vocabulary changes: `projectRoot` or `projectDir` to `productDir`, plus helper names that still imply an unqualified repository root.
- Update config modules, descriptor generators, spec-tree harnesses, and tests only where that vocabulary appears in the edited API surface.
- Do not make architectural changes, logic refactors, unrelated test rewrites, or cleanup edits discovered during the rename sweep.
- Remove compatibility aliases in the same pass rather than preserving legacy names.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

This packet has no settled prerequisite sentinel files beyond the branch-existence guard.

If C1 is already in flight or C2 starts before C1 merges, check `spx/16-config.enabler/PLAN.md` for the dispatcher-enforced merge-ordering guard before parallel work proceeds.

Start from fresh origin/main on work/product-directory-api. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/16-config.enabler/65-product-directory-api.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Rename config and harness root-directory APIs to productDir in one coherent pass. Own the rename sweep across the product for this vocabulary only; do not make unrelated changes to files touched by the sweep. Remove non-product compatibility aliases instead of preserving them. Rename ambiguous root-resolution helper names to tracked product root, worktree-local product root, or Git common-dir product root vocabulary. Use git mv for tracked moves. Run focused config and test-environment tests, pnpm run validate, and pnpm test. Open one PR and ask reviewers to audit vocabulary completeness and absence of compatibility shims.
```
