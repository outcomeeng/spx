# TypeScript enforcement tooling

TypeScript structural rules use ESLint custom rules and `no-restricted-syntax` selectors for single-file abstract syntax tree patterns, and product-local Node detectors for cross-file data joins. Broad-rule warning scopes use validated shrink-only manifests, refining the closed-set and value-ownership rules in `spx/41-validation.enabler/32-typescript-validation.enabler/21-typescript-conventions.adr.md`.

## Rationale

ESLint supplies editor and validation-pipeline feedback for import restrictions, banned syntax, value-level detection, and test-evidence constraints visible in one syntax tree. Cross-file literal provenance requires a repository-level join because one-file rule execution cannot compare source and test declarations. Shrink-only manifests permit staged warning cleanup while rejecting new debt.

String matching cannot distinguish code from comments or resolve aliased imports. TypeScript compiler plugins add version coupling without improving editor integration, while Semgrep duplicates the TypeScript syntax model already available through ESLint.

## Invariants

- Every structural enforcement rule traces to one governing decision through the owning spec.
- Every warning-scoped rule accepts only node paths present in its committed baseline, so the warning scope never grows.
- Single-file syntax patterns run through ESLint; cross-file data joins run through product-local detectors.

## Verification

### Audit

- ALWAYS: encode an architecture rule as an ESLint rule when one syntax tree contains the evidence needed to decide it ([audit])
- ALWAYS: use a product-local Node detector when enforcement requires a cross-file data join ([audit])
- ALWAYS: trace each enforcement rule to its governing decision through the spec's `[enforce]` evidence link; diagnostic messages do not cite decision numbers ([audit])
- ALWAYS: run ESLint enforcement rules in `pnpm run lint` and cross-file detectors in `spx validation all` ([audit])
- ALWAYS: gate broad-rule warning scopes with validated shrink-only manifests ([audit])
- ALWAYS: exercise each custom ESLint rule with `RuleTester` cases covering accepted and rejected syntax ([audit])
- ALWAYS: exercise each cross-file detector through pure inputs or injected dependencies while keeping filesystem walking at the boundary ([audit])
- NEVER: enforce structural compliance by reading source files as text and matching regular expressions ([audit])
- NEVER: write an enforcement rule without a governing ADR or PDR ([audit])
- NEVER: ship a custom rule without accepted and rejected `RuleTester` coverage ([audit])
- NEVER: run a cross-file detector in the validation pipeline without evidence that pins its diagnostic surface ([audit])
- NEVER: downgrade broad-rule diagnostics through ad hoc flat-config overrides ([audit])
- NEVER: introduce Semgrep for TypeScript structural enforcement ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, or module replacement to verify an enforcement rule or detector ([audit])
