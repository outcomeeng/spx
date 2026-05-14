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
