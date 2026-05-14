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

## Agent Pickup Prompt

```text
Start from fresh origin/main on work/review-config-descriptor. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/46-reviewing.enabler/21-review-config.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Add the registered review descriptor for reviewer selection, target filters, base ref behavior, execution defaults, and state policy. Keep review descriptor policy independent from audit descriptor policy while importing shared structural primitives. Prove defaults, valid overrides, invalid values, target filters, descriptor isolation, registry composition, and config-format mapping. Open one PR and ask reviewers to audit descriptor shape and audit/review separation.
```
