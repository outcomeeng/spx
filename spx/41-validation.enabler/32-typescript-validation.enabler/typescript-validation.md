# TypeScript Validation

PROVIDES the registered TypeScript validation stages
SO THAT `spx validation all` running against a TypeScript project
CAN report quality issues across every TypeScript-specific concern before code reaches production

## Assertions

### Scenarios

- Given a TypeScript project with no violations, when `spx validation all` runs, then every TypeScript stage passes and the command exits zero ([test](tests/typescript-validation.integration.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation all` runs, then every registered TypeScript stage reports that it was skipped ([test](tests/typescript-validation.integration.test.ts))

### Compliance

- ALWAYS: every registered TypeScript stage either runs or reports an explicit skip reason ([test](tests/typescript-validation.integration.test.ts))
