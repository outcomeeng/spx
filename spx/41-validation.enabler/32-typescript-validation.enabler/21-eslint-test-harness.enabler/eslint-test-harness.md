# ESLint Rule-Tester Test Harness

PROVIDES an ESLint `RuleTester` harness — tester factories over the shared validation language options with and without the TypeScript parser, runners that drive a rule's valid and invalid cases through a fresh tester, an explicit tester, a parser-free tester, or a resolved builtin rule, builtin-rule resolution, a `severityOf` reader over a rule config, and a lifecycle-hook installer that wires the RuleTester `describe` and `it` hooks inline and installs the generator's `afterAll` hook
SO THAT the TypeScript AST-enforcement enabler's rule mapping tests and cross-domain custom-rule consumers
CAN assert custom and builtin ESLint rule behavior without re-specifying the RuleTester language options, the TypeScript parser wiring, or builtin-rule lookup

## Assertions

### Scenarios

- Given the RuleTester lifecycle hooks are installed, when a source-owned rule run's cases are driven through a fresh tester, an explicit tester, the parser-free tester, and the builtin rule runner, then every case is exercised without throwing ([test](tests/eslint-test-harness.scenario.l1.test.ts))
- Given a registered builtin rule name, when `validationBuiltinRule` resolves it, then the builtin rule module is returned; given an unregistered name, then it throws ([test](tests/eslint-test-harness.scenario.l1.test.ts))

### Properties

- `severityOf` maps a numeric rule config to that number, an array config whose first element is numeric to that element, and any other config to `undefined` ([test](tests/eslint-test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the RuleTester language options (`ecmaVersion`, `sourceType`) and the `afterAll` lifecycle hook are drawn from the shared `testing/generators/validation/ast-enforcement` generator, the TypeScript parser is `tseslint.parser` from `typescript-eslint`, and the `describe` and `it` hooks are wired inline, so the harness exercises rules under the parser and lifecycle the production lint run uses, per [`spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/21-enforcement-tooling.adr.md`](../32-ast-enforcement.enabler/21-enforcement-tooling.adr.md) ([audit](../32-ast-enforcement.enabler/21-enforcement-tooling.adr.md))
- ALWAYS: rule execution runs in-process through ESLint's `RuleTester` API — the harness spawns no lint subprocess and reads no source file from disk, per [`spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/21-enforcement-tooling.adr.md`](../32-ast-enforcement.enabler/21-enforcement-tooling.adr.md) ([audit](../32-ast-enforcement.enabler/21-enforcement-tooling.adr.md))
