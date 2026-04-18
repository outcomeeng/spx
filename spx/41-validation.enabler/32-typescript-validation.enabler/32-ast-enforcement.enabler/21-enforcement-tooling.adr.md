# Enforcement Tooling

## Purpose

This decision governs how ADR compliance rules are encoded and enforced on TypeScript source code. It applies to every MUST/NEVER rule in every ADR that constrains TypeScript code structure.

## Context

**Business impact:** Automated enforcement catches ADR compliance drift at authoring time — a banned syntax pattern, a hardcoded value that should be derived from a constant. Violations surface as lint errors during development, not as user-facing bugs in production.

**Technical constraints:** ESLint 9 flat config runs against every TypeScript project as part of the validation pipeline. TypeScript AST enforcement is scoped to projects where language detection reports TypeScript present.

## Decision

ESLint custom rules and `no-restricted-syntax` selectors are the enforcement mechanism. Custom rules handle patterns requiring AST traversal logic; `no-restricted-syntax` handles patterns expressible as single AST selectors.

## Rationale

ESLint runs on every `pnpm lint` invocation. Custom rules written against the ESTree AST handle the majority of enforcement needs: import restrictions, banned syntax patterns, code-level compliance checks. The flat config (`eslint.config.ts`) accepts inline rule definitions or plugin references without infrastructure changes.

`no-restricted-syntax` with exported selector arrays provides a lightweight enforcement path for patterns that match a single AST node type. Exporting the selector arrays enables RuleTester-based unit tests that import the actual config arrays.

Alternatives considered:

- **String grep only** — cannot distinguish comments from code, breaks on aliased imports, produces false positives. Not a valid enforcement mechanism for structural rules.
- **TypeScript compiler plugins** — powerful but fragile across TS versions, no IDE integration for diagnostics, steep authoring cost.
- **Semgrep** — polyglot strength is wasted in a single-language scope. Editor integration lags ESLint on TypeScript. Custom rules use a different pattern language than the TypeScript AST developers already know. Semgrep is the right tool for Python AST enforcement, not TypeScript.

## Trade-offs accepted

| Trade-off                               | Mitigation / reasoning                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Custom ESLint rules require authoring   | Rules are small AST visitors; each rule maps to one ADR constraint                                             |
| Rules must be maintained as ADRs evolve | Spec `[enforce]` links trace rules to decisions — when a decision changes, the linked rules surface for update |

## Compliance

### Recognized by

ESLint flat config references project-specific rules via the `spx` plugin namespace. Selector arrays are exported from `eslint-rules/restricted-syntax.ts` for test reuse via the `@eslint-rules` path alias.

### MUST

- Encode each ADR MUST/NEVER rule as an ESLint rule when expressible as an AST pattern — covers import restrictions, banned syntax, structural constraints ([review])
- Trace each enforcement rule to its governing decision via the spec's `[enforce]` evidence link — diagnostic messages do not cite decision numbers because `no-spec-references` prohibits ADR-NN/PDR-NN in code ([review])
- Run all enforcement rules in `pnpm lint` — no manual enforcement step ([review])
- Test each custom rule with `RuleTester` exercising both positive cases (compliant code passes) and negative cases (violations produce the expected diagnostic) ([review])

### NEVER

- Enforce structural compliance by reading source files as text and matching regexes — string grep does not understand code semantics ([review])
- Write enforcement rules without a corresponding ADR — rules must trace to decisions ([review])
- Ship a custom rule without `RuleTester` coverage of both valid and invalid cases — untested rules produce false positives or miss violations silently ([review])
- Introduce Semgrep for TypeScript AST enforcement — one tool per language keeps the validation pipeline coherent ([review])
