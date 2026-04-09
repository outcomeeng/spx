# TypeScript Circular Dependencies

PROVIDES madge-based circular dependency detection for TypeScript source code
SO THAT `spx validation circular` and `spx validation all`
CAN walk the TypeScript import graph and surface cycles that would otherwise cause runtime initialization failures, while leaving non-TypeScript projects untouched

## Assertions

### Scenarios

- Given a TypeScript project with no circular dependencies, when `spx validation circular` runs, then madge reports no cycles and the command exits zero ([test](tests/circular-deps.integration.test.ts))
- Given a TypeScript project with a circular dependency, when `spx validation circular` runs, then the command exits non-zero and reports the cycle ([test](tests/circular-deps.integration.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation circular` runs, then madge does not execute ([test](tests/circular-deps.integration.test.ts))

### Compliance

- ALWAYS: madge invocation is gated on `detectTypeScript` reporting present ([test](tests/circular-deps.integration.test.ts))
- NEVER: invoke madge against a project lacking a `tsconfig.json` ([test](tests/circular-deps.integration.test.ts))
