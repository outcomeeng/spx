# Plan: Review Config

## Purpose

Add the review config descriptor for local hermetic branch and PR review execution.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md`
- `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/domain-path-filters.md`

## Implementation Notes

- Define reviewer selection, target filters, base ref behavior, execution isolation defaults, and state location.
- Keep review descriptor independent from audit descriptor even when both share structural primitives.
- Add config-format coverage for JSON, YAML, and TOML.

## Evidence Required

- Descriptor tests cover defaults, valid overrides, invalid values, target filters, and descriptor isolation.
- Registry tests prove review descriptor composition does not require config-module schema edits.

## Parallelization

This depends on shared config primitives and can run before branch/PR command implementation.
