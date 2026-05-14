# Plan: Audit Config

## Purpose

Add the audit config descriptor and wire audit command code to resolved audit settings.

## Governing Specs

- `spx/36-audit.enabler/audit.md`
- `spx/36-audit.enabler/11-audit-scope.pdr.md`
- `spx/36-audit.enabler/15-audit-directory.adr.md`
- `spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md`

## Implementation Notes

- Descriptor defaults include `.spx`, `audit`, `runs`, verdict filenames, state filenames, `baseRef`, and branch slug limits.
- Auditor selection and target filters belong in the descriptor.
- Keep `spx audit verify <file>` accepting explicit files independent from descriptor target filters.

## Evidence Required

- Descriptor tests cover defaults, valid overrides, invalid storage values, target filters, auditor selection, and descriptor isolation.
- Config-format tests cover the audit section in JSON, YAML, and TOML.
- Validation proves audit code consumes resolved config rather than parsing raw config files.

## Parallelization

This depends on shared config primitives and can run in parallel with branch-run-state design once the descriptor shape is stable.
