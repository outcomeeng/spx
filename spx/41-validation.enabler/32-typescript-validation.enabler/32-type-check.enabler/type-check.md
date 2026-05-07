# TypeScript Type Check

PROVIDES tsc-based type checking for TypeScript source code
SO THAT `spx validation typescript` and `spx validation all`
CAN run the TypeScript compiler against TypeScript projects — reporting type errors without emitting output — while leaving non-TypeScript projects untouched

## Assertions

### Scenarios

- Given a project with TypeScript present and a valid `tsconfig.json`, when `spx validation typescript` runs, then tsc executes and exits zero for a clean project ([test](tests/type-check.scenario.l2.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx validation typescript` runs, then tsc does not execute and no `npx` install prompt appears ([test](tests/type-check.scenario.l2.test.ts))
- Given a TypeScript project with type errors, when `spx validation typescript` runs, then the command exits non-zero and reports the errors ([test](tests/type-check.scenario.l2.test.ts))

### Compliance

- ALWAYS: tsc invocation is gated on `detectTypeScript` reporting present ([test](tests/type-check.scenario.l2.test.ts))
- ALWAYS: tsc subprocess stdout and stderr are piped through the parent process output streams rather than inherited directly, so CLI lifecycle handlers observe downstream pipe closure and can terminate tracked subprocesses ([test](tests/type-check.compliance.l1.test.ts))
- NEVER: invoke tsc via `npx` against a project lacking a `tsconfig.json` — prevents installation prompts and ENOENT failures ([test](tests/type-check.scenario.l2.test.ts))
