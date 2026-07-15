# Enforcement Tooling

TypeScript single-file structural compliance uses ESLint custom rules and `no-restricted-syntax` selectors over the TypeScript AST. Broad-rule warning severity is governed by shrink-only node manifests whose committed baseline cannot grow.

## Rationale

ESLint 9 flat configuration runs across every TypeScript product through the validation pipeline and provides editor-integrated enforcement for import restrictions, banned syntax, value-level patterns, and test-evidence constraints. `no-restricted-syntax` selectors are sufficient for direct AST-node patterns, while custom rules own patterns that require richer traversal or diagnostics.

String matching cannot distinguish executable structure from comments or account for aliased imports. TypeScript compiler plugins add version coupling without improving the validation surface, and Semgrep duplicates the TypeScript AST toolchain. Cross-file data joins belong to their owning validation concern because one ESLint invocation sees one file. Shrink-only manifests permit a broad rule to identify named warning scopes while preventing new debt from joining the baseline.

## Invariants

- Every structural constraint is owned by a governing decision and enforced through exactly one mechanism appropriate to its analysis scope.
- Every pattern governed by this decision is enforced through the TypeScript AST rather than source-text matching.
- A shrink-only warning manifest can retain or remove committed entries and cannot admit an entry absent from its committed baseline.

## Verification

### Testing

- ALWAYS: every custom ESLint rule is exercised against conforming and violating cases through ESLint's `RuleTester` ([compliance])
- ALWAYS: every ESLint enforcement rule participates in `pnpm lint` ([compliance])
- NEVER: a broad-rule warning scope accepts a node absent from its committed shrink-only manifest baseline ([compliance])

### Audit

- ALWAYS: use ESLint custom rules or `no-restricted-syntax` selectors for single-file TypeScript AST patterns ([audit])
- ALWAYS: trace each enforcement rule to its governing decision through the spec's `[enforce]` link while diagnostics omit decision numbers and paths ([audit])
- ALWAYS: tests exercise imported rule modules, the TypeScript parser, and validation registration through real or dependency-injected code paths ([audit])
- NEVER: enforce TypeScript structural compliance by reading source files as text or matching regular expressions over source text ([audit])
- NEVER: create an enforcement rule without a governing architecture or product decision ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, or module interception to replace a rule, parser, detector, registry, or validation boundary under test ([audit])
- NEVER: downgrade a broad-rule diagnostic through an ad hoc flat-config override; warning scope is owned by a validated shrink-only manifest ([audit])
- NEVER: introduce Semgrep for TypeScript AST enforcement ([audit])
