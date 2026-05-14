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

## Agent Pickup Prompt

```text
Start from fresh origin/main on work/audit-config-descriptor. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/36-audit.enabler/43-audit-config.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Add the registered audit descriptor for storage defaults, baseRef, branch slug settings, auditor selection, and target filters. Use the shared path-filter primitive for include/exclude target selection. Keep `spx audit verify <file>` independent from descriptor target filters. Prove defaults, valid overrides, invalid storage values, target filters, auditor selection, config-format mapping, and descriptor isolation. Open one PR and ask reviewers to audit descriptor shape and separation from verify-only file handling.
```
