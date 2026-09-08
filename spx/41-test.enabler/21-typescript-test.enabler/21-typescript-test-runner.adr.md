# TypeScript Vitest Adapter Architecture

The TypeScript Vitest runner adapter is a `typescriptTestingLanguage` descriptor exported from `src/test/languages/typescript.ts`, conforming to the `TestingLanguageDescriptor` contract of `spx/19-language-registration.adr.md` and the runner-adapter boundary in `spx/41-test.enabler/11-test-runner-environments.pdr.md`. It detects TypeScript presence, emits this product's Vitest command shape, and derives passing-scope exclusion flags in the descriptor module, so command construction, the detection gate, and flag generation are verifiable at `l1` without the real tool. The descriptor exposes `name` (`typescript`), `testFilePatterns` (`*.test.ts`, `*.test.tsx`) and a matching predicate over file paths, `detect(productDir, deps?)` resolving TypeScript presence through descriptor-owned detection with an optional test override, `excludeFlag(nodePath)` mapping an excluded node path to `--exclude=spx/{nodePath}/**`, and `runTests(request, deps)` invoking the configured command through the injected command runner over the supplied paths and exclusion flags and returning a runner outcome carrying the process exit code and optional output artifacts. The descriptor also exposes a journal-streaming run — a programmatic Vitest run started through the Node API with the journal-streaming reporter of `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` injected — so a language-neutral consumer reaches per-module scope and per-failing-case evidence through the testing registry without naming Vitest, keeping the CLI-flag `runTests` and the streaming run as separate descriptor capabilities that coexist until the equivalence gate of `spx/34-verification.enabler/PLAN.md`. Both capabilities reach the product's own Vitest: `runTests` invokes it through the product's package manager, and the streaming run resolves the Vitest Node API against the product directory under test before importing it.

## Rationale

Injecting the command runner and allowing a test-only detection override makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` without invoking real Vitest or mocking. Passing exclusions as invocation-time flags keeps the product's `vitest.config.ts`, `tsconfig.json`, and `package.json` unmodified. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming TypeScript, and the descriptor contract is the same module its Python peer imports.

Runner descriptors own test scope because writing exclusions into `vitest.config.ts` mutates product configuration the node must never write. The language registry owns TypeScript detection so CLI orchestration remains language-neutral. The detection gate prevents pointless subprocess invocation and preserves the distinction between "absent" and "passed".

The runner belongs to the product under test, so both capabilities locate it there rather than inheriting whatever the adapter's own installation supplies. A bare specifier resolves against the importing module's location, which for a globally installed harness is the harness's own package rather than the product being tested — an ambient resolution that yields no runner at all when the harness omits Vitest, and the harness's runner rather than the product's when it carries one. Explicit resolution against the product directory removes both outcomes and keeps the version the product selected in force, which the streaming run requires because its reporter binds the Vitest lifecycle contract the running instance implements. The entry the run starts is the one the product's Vitest declares for the Node API subpath in its manifest's `exports` map, under the conditions of an ESM import, through a literal key or a pattern key covering the subpath, and as a string target or a conditions object; a package declaring no such entry — no `exports` map, no key covering the subpath, no target under those conditions, or a fallback-array target — is a product without the runner, and the adapter resolves no legacy, exports-less layout. Declaring Vitest a dependency of the harness is rejected for the same reason: it makes the harness the source of a consumer's test runner, contradicting the adapter contract as the only place a consumer's runner layout is required.

## Invariants

- Command construction is a pure function of the supplied paths and exclusion flags.
- The detection gate short-circuits before any subprocess is spawned when TypeScript is absent.
- No product configuration file is written during detection, flag generation, or invocation.
- An excluded node path maps to exactly one `--exclude=spx/{nodePath}/**` flag.
- Runner environment changes output handling only; it does not change this adapter's selected command, paths, or exclusion flags.
- Every Vitest this adapter runs resolves from the product directory under test — the package-manager invocation for the CLI-flag run, and the Node API module for the streaming run.

## Verification

### Testing

- ALWAYS: the journal-streaming run resolves the Vitest Node API against the product directory under test and imports the resolved module, so the run starts the Vitest that product selected ([compliance])
- ALWAYS: the streaming run reports an unresolvable Vitest Node API as a runner outcome naming the product directory searched, so a product without the runner is distinguishable from a run that started and failed ([compliance])
- NEVER: the harness declares Vitest a runtime dependency of its own package to satisfy the streaming run — the runner belongs to the product under test, and a harness-supplied Vitest binds a lifecycle contract the product's selected version need not implement ([compliance])

### Audit

- ALWAYS: `runTests` accepts an injected command-execution dependency so `l1` tests supply a deterministic command function and inspect the constructed invocation ([audit])
- ALWAYS: the detection predicate is owned by the TypeScript descriptor and accepts only a test override for `l1` gate tests ([audit])
- ALWAYS: `excludeFlag` maps an excluded node path to `--exclude=spx/{nodePath}/**` as a pure function ([audit])
- ALWAYS: command construction, executable lookup or package-manager invocation, explicit test-file arguments, and exclusion arguments remain inside the TypeScript runner adapter ([audit])
- ALWAYS: test-file pattern matching for `*.test.ts` and `*.test.tsx` is a pure function over file paths ([audit])
- ALWAYS: the descriptor conforms to the `TestingLanguageDescriptor` contract per `spx/19-language-registration.adr.md` ([audit])
- ALWAYS: the descriptor's journal-streaming run accepts the evidence sink and the run-starter as injected dependencies — enables `l1` verification that the descriptor drives the run without a real Vitest run or mocking ([audit])
- ALWAYS: the journal-streaming run delegates its programmatic Vitest run and reporter to `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler`, so the descriptor constructs no reporter or journal event of its own ([audit])
- ALWAYS: the journal-streaming run is gated on the detection result like the CLI-flag run — it yields a gated-out run without invoking Vitest when TypeScript is absent, and starts the run only when detection passes ([audit])
- ALWAYS: a language-neutral consumer reaches the journal-streaming run through the testing registry enumeration per `spx/19-language-registration.adr.md`, never by importing the TypeScript descriptor or reporter module directly ([audit])
- ALWAYS: module resolution for the streaming run enters through an injected dependency alongside the run-starter, so `l1` verification supplies a deterministic resolver and inspects the resolved specifier without a real Vitest installation or mocking ([audit])
- NEVER: the journal-streaming run is selected through a `--reporter` command flag — the reporter is registered on the programmatically started run per `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` ([audit])
- NEVER: the streaming run loads the Vitest Node API through a bare specifier whose resolution depends on the location the harness itself is installed at ([audit])
- NEVER: write to `vitest.config.ts`, `tsconfig.json`, or `package.json` — exclusions pass as invocation-time flags ([audit])
- NEVER: invoke vitest when TypeScript is absent — the descriptor's `detect` function calls `detectTypeScript` directly when no test override is provided ([audit])
- NEVER: import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([audit])
- NEVER: runner tests call `vi.mock()`, `jest.mock()`, or another framework replacement API for command execution — they supply deterministic functions through the injected dependency ([audit])
- NEVER: hardcode language dispatch in orchestration — registration is through the descriptor per `spx/19-language-registration.adr.md` ([audit])
- NEVER: require TypeScript consumers to use Vitest, `node_modules`, or a specific package-manager layout outside an explicitly selected adapter contract ([audit])
