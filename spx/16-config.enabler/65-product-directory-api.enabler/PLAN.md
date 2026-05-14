# Plan: Product Directory API

## Purpose

Rename config and descriptor-facing repository-root APIs to `productDir`.

## Governing Specs

- `spx/16-config.enabler/config.md`
- `spx/16-config.enabler/21-descriptor-registration.adr.md`
- `spx/22-test-environment.enabler/test-environment.md`
- `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/spec-tree-fixtures.md`

## Implementation Notes

- Rename config CLI dependency names, config test generators, harness fields, and spec text in one coherent pass.
- Do not add `projectRoot` or `projectDir` aliases.
- Keep non-product root-directory names only in text that is deleted in the same branch.

## Evidence Required

- Config and descriptor tests use `productDir` in public helper names and assertions.
- Repository searches show no added `projectRoot` or `projectDir` call sites in the edited APIs.
- `spx validation all` and full tests pass.

## Parallelization

This should be a focused rename PR because it touches many tests and helper imports.
