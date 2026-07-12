PROVIDES the registered TypeScript validation stages
SO THAT `spx validation all` running against a TypeScript product
CAN report quality issues across every TypeScript-specific concern before code reaches production

## Assertions

### Scenarios

- Given a TypeScript product with no violations, when `spx validation all` runs, then every registered TypeScript stage returns a successful or explicit skip verdict and the command exits zero ([test](tests/typescript-validation.scenario.l2.test.ts))
- Given a product where language detection reports TypeScript absent, when `spx validation all` runs, then every registered TypeScript stage reports that it was skipped ([test](tests/typescript-validation.scenario.l2.test.ts))

### Mappings

- TypeScript validation concerns map lint, type check, AST enforcement, circular dependency detection, literal reuse, and unused-code detection to their registered leaf stages ([test](tests/typescript-validation.mapping.l1.test.ts))

### Compliance

- ALWAYS: every registered TypeScript stage follows its descriptor default during full-pipeline dispatch, and every participating or skipped stage reports a verdict ([test](tests/typescript-validation.compliance.l2.test.ts))
