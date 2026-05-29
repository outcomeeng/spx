# TypeScript Test Runner Architecture

## Purpose

This decision governs how the TypeScript test runner detects TypeScript presence, invokes vitest, and derives passing-scope exclusion flags, exposed as a descriptor conforming to `spx/19-language-registration.adr.md`.

## Context

**Business impact:** `spx test` and `spx test passing` dispatch test files to the language runner registered for each extension. The TypeScript runner executes vitest over discovered test files, honoring passing-scope exclusions, without touching the product's own vitest, TypeScript, or package configuration.

**Technical constraints:** TypeScript presence is determined by the product's `detectTypeScript` detection function, governed by `spx/17-language-detection.enabler/32-typescript.enabler`, which recognizes a `tsconfig.json`. vitest runs through the project's package manager so the project's `node_modules` provides the binary. The descriptor-and-registry registration pattern is fixed by `spx/19-language-registration.adr.md`; the central registry and the `spx test` dispatch that consumes it are the parent `spx/41-testing.enabler/testing.md` concern, not this node.

## Decision

Export a `typescriptTestingLanguage` descriptor from `src/testing/languages/typescript.ts` that conforms to a `TestingLanguageDescriptor` contract: it carries the language name, a detection predicate delegating to injected `detectTypeScript`, the vitest test-file patterns, a pure exclusion-flag generator, and a `runTests` operation that invokes vitest through an injected command runner with the generated exclusion flags. Every external dependency — the command runner and the detection function — is injected.

The descriptor exposes:

1. `name` — the language identity (`typescript`)
2. `detect(productRoot, deps)` — presence predicate delegating to the injected `detectTypeScript`
3. `testFilePatterns` — the vitest target patterns (`*.test.ts`, `*.test.tsx`)
4. `excludeFlag(nodePath)` — pure mapping from an excluded node path to the vitest flag `--exclude=spx/{nodePath}/**`
5. `runTests(request, deps)` — invokes vitest through the injected command runner over the supplied paths and exclusion flags, returning a runner outcome carrying the process exit code

## Rationale

Injecting the command runner and the detection function makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` without invoking real vitest or mocking. Passing exclusions as invocation-time flags keeps the product's `vitest.config.ts`, `tsconfig.json`, and `package.json` unmodified, satisfying the node's NEVER constraints. Routing vitest through the project's package manager reuses the project's installed toolchain rather than resolving a binary path. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming TypeScript.

Alternatives considered:

- **Write exclusions into `vitest.config.ts`** — mutates product configuration the node must never write; exclusion belongs at invocation time. Rejected.
- **Resolve and spawn the vitest binary directly** — bypasses the project's package manager and its environment, and hardcodes a path. Rejected — invoke through the package manager.
- **Detect TypeScript inside the runner via direct filesystem reads** — duplicates `detectTypeScript` and couples the runner to the filesystem. Rejected — delegate to the injected detection function.
- **Skip the detection gate and let vitest no-op on a non-TypeScript project** — invokes a subprocess pointlessly and conflates "absent" with "passed". Rejected — gate before invocation.

## Trade-offs accepted

| Trade-off                                                   | Mitigation / reasoning                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Invocation through the package manager adds a process layer | The injected command runner makes command construction `l1`-testable; the real subprocess is covered at the integration level |
| The exclusion-flag string is coupled to the vitest CLI      | The mapping is isolated in one pure `excludeFlag` function, so a CLI change touches one place                                 |
| The descriptor contract is shared with the Python peer      | The contract conforms to `spx/19-language-registration.adr.md`; the same-index peer imports the same contract module          |

## Invariants

- Command construction is a pure function of the supplied paths and exclusion flags
- The detection gate short-circuits before any subprocess is spawned when TypeScript is absent
- No product configuration file is written during detection, flag generation, or invocation
- An excluded node path maps to exactly one `--exclude=spx/{nodePath}/**` flag

## Compliance

### Recognized by

Observable injected command-runner and detection dependencies on the runner functions. The descriptor is a value exported from `src/testing/languages/typescript.ts` conforming to the `TestingLanguageDescriptor` contract.

### MUST

- `runTests` accepts an injected command-execution dependency — enables `l1` testing of command construction without invoking vitest or mocking ([review])
- The detection predicate delegates to an injected `detectTypeScript` — enables `l1` testing of the gate ([review])
- `excludeFlag` maps an excluded node path to `--exclude=spx/{nodePath}/**` as a pure function ([review])
- vitest is invoked through the project's package manager command ([review])
- Test-file pattern matching for `*.test.ts` and `*.test.tsx` is a pure function over file paths ([review])
- The descriptor conforms to the `TestingLanguageDescriptor` contract per `spx/19-language-registration.adr.md` ([review])

### NEVER

- Write to `vitest.config.ts`, `tsconfig.json`, or `package.json` — exclusions pass as invocation-time flags ([review])
- Invoke vitest when the injected `detectTypeScript` reports TypeScript absent ([review])
- Import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([review])
- Hardcode language dispatch in orchestration — registration is through the descriptor per `spx/19-language-registration.adr.md` ([review])
