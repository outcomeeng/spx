# TypeScript Validation

PROVIDES the TypeScript validation pipeline — ESLint for lint and AST enforcement, tsc for type checking, madge for circular dependency detection
SO THAT `spx validation all` running against a TypeScript project
CAN report quality issues across every TypeScript-specific concern before code reaches production

## Assertions

### Scenarios

- Given a TypeScript project with no violations, when `spx validation all` runs, then every TypeScript stage passes and the command exits zero ([test](tests/typescript-validation.integration.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation all` runs, then no TypeScript stage executes ([test](tests/typescript-validation.integration.test.ts))

### Mappings

- TypeScript stages: `lint` → ESLint, `type-check` → tsc, `circular-deps` → madge, `ast-enforcement` → ESLint custom rules ([test](tests/typescript-validation.integration.test.ts))

### Compliance

- ALWAYS: every TypeScript stage is gated on `detectTypeScript` reporting present ([test](tests/typescript-validation.integration.test.ts))
- NEVER: invoke a TypeScript stage's tool against a project where language detection reports TypeScript absent ([test](tests/typescript-validation.integration.test.ts))
