# TypeScript Testing

PROVIDES vitest invocation for TypeScript test files in `spx/**/tests/`
SO THAT `spx test` and `spx test passing`
CAN execute TypeScript tests with exclusion flags derived from `spx/EXCLUDE`, without modifying `vitest.config.ts`, `tsconfig.json`, or `package.json`

## Assertions

### Scenarios

- Given TypeScript test files in `spx/**/tests/*.test.ts`, when the typescript-testing runner is invoked with a list of paths, then vitest executes against those paths and exits zero for passing tests ([test](tests/typescript-testing.integration.test.ts))
- Given an excluded node in `spx/EXCLUDE`, when `spx test passing` runs, then vitest is invoked with `--exclude=spx/{node}/**` for that node ([test](tests/typescript-testing.integration.test.ts))
- Given a TypeScript test imports a module that does not exist, when vitest runs against that file without exclusion, then vitest exits non-zero ([test](tests/typescript-testing.integration.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx test` runs, then vitest is not invoked ([test](tests/typescript-testing.integration.test.ts))

### Mappings

- TypeScript test file patterns: `*.test.ts` and `*.test.tsx` — any file matching these patterns under `spx/**/tests/` is a vitest target ([test](tests/typescript-testing.unit.test.ts))
- Exclusion flag generation: an excluded node path `{segment}` maps to vitest flag `--exclude=spx/{segment}/**` ([test](tests/typescript-testing.unit.test.ts))

### Compliance

- ALWAYS: vitest invocation is gated on `detectTypeScript` reporting present ([test](tests/typescript-testing.integration.test.ts))
- ALWAYS: vitest runs via the project's package manager (`pnpm run test` or equivalent) so the project's `node_modules` provides the tool ([review])
- NEVER: write vitest configuration into `vitest.config.ts`, `tsconfig.json`, or `package.json` — exclusion flags pass at invocation time ([review])
