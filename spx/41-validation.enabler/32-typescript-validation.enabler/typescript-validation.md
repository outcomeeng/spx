# TypeScript Validation

PROVIDES the TypeScript validation pipeline — stages for lint, type checking, AST enforcement, circular dependency detection, literal reuse, and unused-code detection
SO THAT `spx validation all` running against a TypeScript project
CAN report quality issues across every TypeScript-specific concern before code reaches production

## Assertions

### Scenarios

- Given a TypeScript project with no violations, when `spx validation all` runs, then every TypeScript stage passes and the command exits zero ([test](tests/typescript-validation.scenario.l2.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation all` runs, then no TypeScript stage executes ([test](tests/typescript-validation.scenario.l2.test.ts))

### Mappings

- TypeScript validation concerns: lint, type-check, ast-enforcement, circular-deps, literal-reuse, unused-code — each concern is provided by a leaf enabler child and composed through the registered TypeScript descriptor ([test](tests/typescript-validation.mapping.l1.test.ts))

### Compliance

- ALWAYS: every TypeScript stage is gated on `detectTypeScript` reporting present ([test](tests/typescript-validation.compliance.l2.test.ts))
- NEVER: invoke a TypeScript stage against a project where language detection reports TypeScript absent ([test](tests/typescript-validation.compliance.l2.test.ts))
