# Plan: Testing Config

## Purpose

Move testing passing-scope policy from standalone files to the testing config descriptor.

## Governing Specs

- `spx/41-testing.enabler/testing.md`
- `spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md`
- `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/domain-path-filters.md`

## Implementation Notes

- Add the testing descriptor after shared path filters exist.
- Wire `spx test passing` through the descriptor and file-inclusion path filter mechanics.
- Keep `spx test` running all discovered tests unless the user supplied explicit runner scope.
- Remove stale `spx/EXCLUDE` test fixtures once config-backed passing scope is covered.

## Evidence Required

- Descriptor tests cover defaults, valid filters, invalid filters, and descriptor isolation.
- Scenario tests prove filtered nodes are skipped before runner invocation for `spx test passing`.
- Scenario tests prove filtered nodes still run when `passing` is absent.
- Regression tests prove validation path filters do not affect testing passing scope.

## Parallelization

This depends on shared path-filter primitives. Last-run evidence can begin after this descriptor exposes the digest inputs.
