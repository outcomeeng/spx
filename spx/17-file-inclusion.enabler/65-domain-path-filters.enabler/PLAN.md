# Plan: Domain Path Filters

## Purpose

Wire typed config-backed domain path-filter inputs through the file-inclusion resolver so each validate, test, audit, review, and evaluate consumer narrows scope within the git-tracking default per `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`.

## Governing Artifacts

- `spx/17-file-inclusion.enabler/file-inclusion.md`
- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`
- `spx/17-file-inclusion.enabler/15-scope-composition.adr.md`
- `spx/16-config.enabler/32-shared-config-primitives.enabler/shared-config-primitives.md`

## Implementation Notes

- The scope-resolver accepts a typed domain path filter alongside override flags and explicit caller paths.
- Domain filters layer on top of the git-tracking default — they narrow or restrict within the git-tracked set, never replace git's view as the default scope source.
- Operators who want ignored entries processed pass `--no-ignore`, `--no-ignore-vcs`, or `--ignore-file` per `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`, not a domain filter `include` pattern.

## Evidence Required

- Scope resolver tests cover include misses, exclude matches, and explicit override layered on top of the git-tracking default.
- Tool adapter tests prove ignore flags derive from the resolved excluded paths only.
- Regression tests prove validate path filters do not affect `test passing` scope.

## Implementation Ownership

- Own the domain path-filter resolver changes and tests required by this node under `src/lib/file-inclusion/` and this node's co-located `tests/`.
- Consume the shared path-filter primitive from `src/config/primitives/`; do not define a second path-filter shape or validator.
- Coordinate with the git-tracking reader work under `spx/17-file-inclusion.enabler/21-ignore-source.enabler/` and the predicate work under `spx/17-file-inclusion.enabler/32-path-predicates.enabler/`; this node depends on both being in place.
