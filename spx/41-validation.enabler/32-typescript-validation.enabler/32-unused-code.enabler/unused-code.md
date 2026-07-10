# TypeScript Unused Code

PROVIDES Knip-based unused-code detection for TypeScript projects
SO THAT `spx validation knip` and `spx validation all`
CAN report unused files, exports, and dependencies within the requested TypeScript scope

## Assertions

### Scenarios

- Given a TypeScript project with Knip enabled and no unused code, when `spx validation knip` runs, then Knip executes and the command exits zero ([test](tests/unused-code.scenario.l1.test.ts))
- Given a TypeScript project with Knip disabled, when `spx validation knip` runs, then the command reports configured disablement without executing Knip ([test](tests/unused-code.scenario.l1.test.ts))

### Compliance

- ALWAYS: Knip invocation is gated on `detectTypeScript` reporting present ([test](tests/unused-code.compliance.l1.test.ts))
- ALWAYS: explicit TypeScript file scope is forwarded to Knip after TypeScript scope resolution ([test](tests/unused-code.compliance.l1.test.ts))
