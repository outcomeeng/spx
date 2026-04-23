# TypeScript AST Enforcement

PROVIDES ESLint custom rules and `no-restricted-syntax` selectors that enforce ADR compliance rules on TypeScript source code
SO THAT TypeScript validation outcomes and their tests
CAN focus on behavior, trusting that structural compliance — correct imports, banned syntax, module boundaries — is caught by ESLint during `spx validation lint`

## Assertions

### Mappings

Global TypeScript conventions (`no-restricted-syntax` selectors, all `.ts`/`.tsx` files):

- `TSEnumDeclaration` maps to lint error — use `as const` object literals with types derived via `keyof typeof` ([test](tests/ast-enforcement.unit.test.ts))
- Bare string-literal union types (`type X = "a" | "b"` and similar `TSUnionType` composed of `TSLiteralType` string members) map to lint error — declare the set as an `as const` object literal and derive the union via `keyof typeof` ([test](tests/ast-enforcement.unit.test.ts))
- `as any` type assertion maps to lint error — use `as unknown` and narrow with a type guard ([test](tests/ast-enforcement.unit.test.ts))
- `<any>` type assertion maps to lint error — use `as unknown` and narrow with a type guard ([test](tests/ast-enforcement.unit.test.ts))

Test evidence quality (`no-restricted-syntax` selectors, `*.test.ts`/`*.test.tsx` files):

- `vi.mock()` maps to lint error — use dependency injection ([test](tests/ast-enforcement.unit.test.ts))
- `vi.fn()` maps to lint error — use typed interface implementations ([test](tests/ast-enforcement.unit.test.ts))
- `readFileSync` import maps to lint error — requires eslint-disable with justification for legitimate uses ([test](tests/ast-enforcement.unit.test.ts))
- `skipIf` maps to lint error — restructure so the test runs in every environment, or remove it ([test](tests/ast-enforcement.unit.test.ts))
- String literals in assertion arguments map to lint error — use named constants ([test](tests/ast-enforcement.unit.test.ts))

BDD test hygiene (custom rule module in `eslint-rules/`):

- try-catch with expect() and empty catch maps to lint error — empty catch swallows assertion failures ([test](tests/ast-enforcement.unit.test.ts))
- try-catch with expect() and non-rethrowing catch maps to lint error — catch silently suppresses failures ([test](tests/ast-enforcement.unit.test.ts))

### Compliance

- ALWAYS: ESLint flat config references project-specific rules from the enforcement rule set ([review])
- ALWAYS: enforcement rules run as part of `pnpm lint` and `spx validation all` ([review])
- NEVER: reference ADR-NN / PDR-NN by number in code comments, strings, or template literals — code complies silently, never cites decision numbers ([enforce](../../../../eslint-rules/no-spec-references.ts))
- ALWAYS: each enforcement rule references the ADR or PDR it enforces — traceability from rule to decision ([review])
- ALWAYS: enforcement rules produce zero diagnostics on compliant code — no false positives on the codebase ([review])
- NEVER: enforce compliance by reading source files as strings — AST analysis is the only valid enforcement mechanism for structural rules ([review])
