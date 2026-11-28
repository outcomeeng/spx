---
id: 01a20363-54a4-7551-af5c-73bf508f122f
---

# Literal Reuse

PROVIDES the cross-file literal-reuse detection stage — a global pre-pass over every TypeScript source and test file that emits two classes of problem (src↔test reuse and test↔test duplication) for literal values carrying domain meaning, with operator-controlled scoping, suppression, and output formats, and the domain literal generators in `testing/generators/literal/literal.ts` that tests across the Product draw from
SO THAT `spx validation all` running against a TypeScript project
CAN enforce the source/test boundary import rules and the no-test-owned-semantic-constant rules from [`21-typescript-conventions.adr.md`](spx/41-validation.enabler/32-typescript-validation.enabler/21-typescript-conventions.adr.md) — patterns that per-file ESLint rules cannot detect because they require indexing literals across the full codebase

## Test.Property: domain literal generators

- [domain-literal-indexed](tests/literal-reuse.property.l1.test.ts): For every value `arbitraryDomainLiteral()` yields, the production literal collector indexes a `const` string declaration of that value as exactly one string occurrence carrying that value
- [domain-number-indexed](tests/literal-reuse.property.l1.test.ts): For every value `arbitraryDomainNumber()` yields, the production literal collector indexes a `const` numeric declaration of that value as exactly one numeric occurrence carrying that value

## Audit: pipeline

- validation-all-stage: ALWAYS: the stage participates in `spx validation all` — `allCommand` imports and invokes `literalCommand`, which returns a non-zero exit code when problems exist after value-allowlist suppression, path filtering, and kind selection
