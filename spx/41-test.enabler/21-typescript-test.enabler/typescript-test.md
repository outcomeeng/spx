# TypeScript Test

PROVIDES the current TypeScript Vitest runner adapter for TypeScript test files in `spx/**/tests/`
SO THAT `spx test` and `spx test passing`
CAN execute this product's TypeScript tests with exclusion flags derived from `spx.config.{toml,json,yaml}`, without modifying `vitest.config.ts`, `tsconfig.json`, or `package.json`

## Assertions

### Scenarios

- Given TypeScript test files in `spx/**/tests/*.test.ts`, when the typescript-testing runner is invoked with a list of paths, then vitest executes against those paths and exits zero for passing tests ([test](tests/typescript-test.scenario.l2.test.ts))
- Given an excluded node path in `spx.config.{toml,json,yaml}`, when `spx test passing` runs, then vitest is invoked with `--exclude=spx/{node}/**` for that node ([test](tests/typescript-test.scenario.l1.test.ts))
- Given a TypeScript test imports a module that does not exist, when vitest runs against that file without exclusion, then vitest exits non-zero ([test](tests/typescript-test.scenario.l2.test.ts))
- Given a project where language detection reports TypeScript absent, when `spx test` runs, then vitest is not invoked ([test](tests/typescript-test.scenario.l1.test.ts))

### Mappings

- TypeScript test file patterns: `*.test.ts` and `*.test.tsx` — any file matching these patterns under `spx/**/tests/` is a vitest target ([test](tests/typescript-test.mapping.l1.test.ts))
- Config-driven exclusion flag generation: an excluded node path `{segment}` maps to vitest flag `--exclude=spx/{segment}/**` ([test](tests/typescript-test.mapping.l1.test.ts))

### Compliance

- ALWAYS: Vitest invocation is gated on the TypeScript testing descriptor's detection result ([test](tests/typescript-test.compliance.l1.test.ts))
- ALWAYS: the TypeScript testing descriptor exposes a journal-streaming run alongside its CLI-flag run — a programmatic Vitest run hosting the reporter of `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` — enumerated through the testing registry per `spx/19-language-registration.adr.md`, so a language-neutral consumer drives per-module scope and per-failing-case evidence into an injected sink without naming Vitest or TypeScript ([test](tests/typescript-test.compliance.l1.test.ts))
- ALWAYS: TypeScript runner command construction, explicit test-file arguments, exclusion arguments, and tool invocation stay inside the selected TypeScript adapter per `spx/41-test.enabler/11-test-runner-environments.pdr.md` ([audit])
- NEVER: write vitest configuration into `vitest.config.ts`, `tsconfig.json`, or `package.json` — exclusion flags pass at invocation time ([audit])
