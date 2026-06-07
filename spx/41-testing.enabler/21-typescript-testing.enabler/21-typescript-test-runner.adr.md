# TypeScript Test Runner Architecture

The TypeScript test runner is a `typescriptTestingLanguage` descriptor exported from `src/testing/languages/typescript.ts`, conforming to the `TestingLanguageDescriptor` contract of `spx/19-language-registration.adr.md`. It detects TypeScript presence, invokes vitest through the project's package manager, and derives passing-scope exclusion flags entirely through injected dependencies — the command runner and the detection function — so command construction, the detection gate, and flag generation are verifiable at `l1` without the real tool.

## Rationale

Injecting the command runner and the detection function makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` without invoking real vitest or mocking. Passing exclusions as invocation-time flags keeps the product's `vitest.config.ts`, `tsconfig.json`, and `package.json` unmodified, and routing vitest through the project's package manager reuses the installed toolchain rather than resolving a binary path. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming TypeScript, and the descriptor contract is the same module its Python peer imports.

Writing exclusions into `vitest.config.ts` was rejected because it mutates product configuration the node must never write; resolving and spawning the vitest binary directly was rejected because it bypasses the package manager and its environment and hardcodes a path; detecting TypeScript inside the runner via direct filesystem reads was rejected because it duplicates `detectTypeScript` and couples the runner to the filesystem; skipping the detection gate to let vitest no-op on a non-TypeScript project was rejected because it invokes a subprocess pointlessly and conflates "absent" with "passed".

## Invariants

The descriptor exposes `name` (`typescript`), `testFilePatterns` (`*.test.ts`, `*.test.tsx`) and a matching predicate over file paths, `detect(projectRoot, deps)` delegating to the injected `detectTypeScript`, `excludeFlag(nodePath)` mapping an excluded node path to `--exclude=spx/{nodePath}/**`, and `runTests(request, deps)` invoking vitest through the injected command runner over the supplied paths and exclusion flags and returning a runner outcome carrying the process exit code.

- Command construction is a pure function of the supplied paths and exclusion flags.
- The detection gate short-circuits before any subprocess is spawned when TypeScript is absent.
- No product configuration file is written during detection, flag generation, or invocation.
- An excluded node path maps to exactly one `--exclude=spx/{nodePath}/**` flag.

## Verification

### Audit

- ALWAYS: `runTests` accepts an injected command-execution dependency — enables `l1` testing of command construction without invoking vitest or mocking ([audit])
- ALWAYS: the detection predicate delegates to an injected `detectTypeScript` — enables `l1` testing of the gate ([audit])
- ALWAYS: `excludeFlag` maps an excluded node path to `--exclude=spx/{nodePath}/**` as a pure function ([audit])
- ALWAYS: vitest is invoked through the project's package manager command ([audit])
- ALWAYS: test-file pattern matching for `*.test.ts` and `*.test.tsx` is a pure function over file paths ([audit])
- ALWAYS: the descriptor conforms to the `TestingLanguageDescriptor` contract per `spx/19-language-registration.adr.md` ([audit])
- NEVER: write to `vitest.config.ts`, `tsconfig.json`, or `package.json` — exclusions pass as invocation-time flags ([audit])
- NEVER: invoke vitest when the injected `detectTypeScript` reports TypeScript absent ([audit])
- NEVER: import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([audit])
- NEVER: hardcode language dispatch in orchestration — registration is through the descriptor per `spx/19-language-registration.adr.md` ([audit])
