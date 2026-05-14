# Plan: Config-Backed File Inclusion

## Purpose

Remove ignore-source scope policy from file inclusion and keep this subtree focused on reusable path predicates, scope resolution, decision trails, and tool-adapted invocation arguments.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns shared config primitives and domain descriptors.
- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` owns default path inclusion behavior and explicit-caller override semantics.

## Current Tranche

1. Replace ignore-source APIs with config-backed path-filter inputs.
   - Work in `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/`.
   - Remove the configured ignore-source filename from the file-inclusion descriptor.
   - Remove `spx/EXCLUDE` reader code and tests.
   - Update scope resolver inputs to accept a typed domain path filter.

2. Keep shared layers inside file inclusion.
   - Artifact-directory predicates stay centralized.
   - Hidden-prefix predicates stay centralized.
   - Explicit caller-supplied paths continue to bypass every automatic filter layer.

3. Keep domain policy outside file inclusion.
   - Validation passes `validation.paths`.
   - Testing passes its passing-scope filter.
   - Audit and review pass target filters when their descriptors exist.
   - File inclusion records the decision trail but does not decide why a domain excludes a path.

## Evidence Required

- Scope resolver tests cover artifact-directory, hidden-prefix, domain path-filter, and explicit override layers independently.
- Tool-adapter tests prove generated ignore flags are derived from the resolved excluded set only.
- Regression tests prove validation paths do not affect testing passing scope and testing passing scope does not affect validation output.
- Removal tests prove no production code reads `spx/EXCLUDE` or imports ignore-source helpers.
- Scope-resolver evidence updates prove `43-scope-resolver.enabler/tests/scope-resolver.property.l1.test.ts` covers the config-backed domain path-filter layer rather than the standalone ignore-source layer.

## Open Coordination

- The existing `spx/17-file-inclusion.enabler/21-ignore-source.enabler/` child becomes deletion work once the testing descriptor consumes config-backed passing scope.
- Delete stale ignore-source tests instead of migrating them in place when their assertions only prove `spx/EXCLUDE` behavior.
