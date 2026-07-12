PROVIDES the registered TypeScript validation stages
SO THAT `spx validation all` running against a TypeScript product
CAN report quality issues across every TypeScript-specific concern before code reaches production

## Assertions

### Scenarios

- Given a TypeScript product with no violations, when `spx validation all` runs, then every registered TypeScript stage follows its descriptor default, each invoked stage returns a successful or explicit skip verdict, and the command exits zero ([test](tests/typescript-validation.scenario.l2.test.ts))
- Given a product where language detection reports TypeScript absent, when `spx validation all` runs, then every registered TypeScript stage reports that it was skipped ([test](tests/typescript-validation.scenario.l2.test.ts))

### Compliance

- ALWAYS: every registered TypeScript stage either runs or reports an explicit skip reason ([test](tests/typescript-validation.compliance.l2.test.ts))
