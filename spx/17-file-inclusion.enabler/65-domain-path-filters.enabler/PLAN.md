# Plan: Domain Path Filters

## Purpose

Replace ignore-source scope policy with typed config-backed path-filter inputs.

## Governing Specs

- `spx/17-file-inclusion.enabler/file-inclusion.md`
- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`
- `spx/17-file-inclusion.enabler/15-scope-composition.adr.md`
- `spx/16-config.enabler/32-shared-config-primitives.enabler/shared-config-primitives.md`

## Implementation Notes

- Update scope resolver inputs to accept a domain path filter.
- Preserve explicit override, artifact-directory, hidden-prefix, and adapter behavior.
- Delete or rewrite tests that only prove standalone `spx/EXCLUDE` behavior.
- Remove production imports of ignore-source reader helpers after testing passing scope consumes config.

## Evidence Required

- Scope resolver tests cover include misses, exclude matches, artifact directories, hidden prefixes, and explicit override.
- Tool adapter tests prove ignore flags derive from resolved excluded paths only.
- Regression tests prove validation filters do not affect testing passing scope.
- Removal tests prove production code no longer reads `spx/EXCLUDE`.

## Parallelization

This depends on the shared path-filter primitive. It can proceed before testing state persistence, but final deletion of ignore-source code depends on config-backed testing passing scope.

## Agent Pickup Prompt

```text
Start from fresh origin/main on work/domain-path-filters. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/16-config.enabler/32-shared-config-primitives.enabler/` reports the settled path-filter primitive. Make the file-inclusion resolver accept typed domain path filters supplied by callers. Preserve explicit caller-path override, artifact-directory filtering, hidden-prefix filtering, decision trails, and tool-adapter output. Delete or rewrite standalone `spx/EXCLUDE` production paths only when config-backed testing passing scope is wired. Prove validation filters do not affect testing passing scope. Open one PR and ask reviewers to audit path-decision trails, caller override behavior, and descriptor-policy separation.
```
