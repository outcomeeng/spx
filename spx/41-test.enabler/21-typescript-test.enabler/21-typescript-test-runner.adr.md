# TypeScript Vitest Adapter Architecture

The TypeScript Vitest runner adapter is a `typescriptTestingLanguage` descriptor exported from `src/test/languages/typescript.ts`, conforming to the `TestingLanguageDescriptor` contract of `spx/19-language-registration.adr.md` and the runner-adapter boundary in `spx/41-test.enabler/11-test-runner-environments.pdr.md`. It detects TypeScript presence, emits this product's Vitest command shape, derives passing-scope exclusion flags, and resolves changed TypeScript source paths to related tests through candidate-test import closure plus source-owned artifact dependency descriptors. A candidate test relates to a changed source path when its transitive import closure reaches that source path directly, or reaches an artifact descriptor that declares the source path as a build input; the resolver returns test paths and covered source paths without running tests. The descriptor exposes `name` (`typescript`), `testFilePatterns` (`*.test.ts`, `*.test.tsx`) and a matching predicate over file paths, `detect(productDir, deps?)` resolving TypeScript presence through descriptor-owned detection with an optional test override, `excludeFlag(nodePath)` mapping an excluded node path to `--exclude=spx/{nodePath}/**`, `runTests(request, deps)` invoking the configured command through the injected command runner over the supplied paths and exclusion flags, and `relatedTestPaths(request, deps)` resolving related paths through injected reads. The descriptor also exposes a journal-streaming run that starts Vitest through the Node API with the journal-streaming reporter of `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` injected, allowing a language-neutral consumer to reach per-module scope and per-failing-case evidence through the testing registry without naming Vitest.

## Rationale

Injecting the command runner and allowing a test-only detection override makes command construction, the detection gate, and exclusion-flag generation verifiable at `l1` without invoking real Vitest or mocking. Passing exclusions as invocation-time flags keeps the product's `vitest.config.ts`, `tsconfig.json`, and `package.json` unmodified. Modeling the runner as an ADR-19 descriptor lets the parent dispatch iterate registered languages without naming TypeScript, and the descriptor contract is the same module its Python peer imports.

Static TypeScript imports describe source-to-source dependencies, while a packaged executable reaches its entrypoint through a build artifact. Import closure therefore resolves ordinary source dependencies, and source-owned artifact descriptors supply the non-import build edges without teaching the planner or test infrastructure a CLI-specific exception. A full-tree product-input classification for an artifact entrypoint is rejected because it suppresses related-test resolution and selects unrelated tests.

Writing exclusions into `vitest.config.ts` was rejected because it mutates product configuration the node must never write; putting TypeScript detection in the CLI orchestration layer was rejected because it makes orchestration reference language identity outside the registry; skipping the detection gate to let Vitest no-op on a non-TypeScript product was rejected because it invokes a subprocess pointlessly and conflates "absent" with "passed".

## Invariants

- Command construction is a pure function of the supplied paths and exclusion flags.
- The detection gate short-circuits before any subprocess is spawned when TypeScript is absent.
- No product configuration file is written during detection, flag generation, or invocation.
- An excluded node path maps to exactly one `--exclude=spx/{nodePath}/**` flag.
- Runner environment changes output handling only; it does not change this adapter's selected command, paths, or exclusion flags.
- Related-test resolution is deterministic for the same candidate contents, TypeScript path mappings, source-owned artifact descriptors, and changed source paths.
- An artifact dependency contributes a changed source path only when the candidate test's import closure reaches that artifact's declaring module.

## Verification

### Audit

- ALWAYS: `runTests` accepts an injected command-execution dependency — enables `l1` testing of command construction without invoking vitest or mocking ([audit])
- ALWAYS: the detection predicate is owned by the TypeScript descriptor and accepts only a test override for `l1` gate tests ([audit])
- ALWAYS: `excludeFlag` maps an excluded node path to `--exclude=spx/{nodePath}/**` as a pure function ([audit])
- ALWAYS: command construction, executable lookup or package-manager invocation, explicit test-file arguments, and exclusion arguments remain inside the TypeScript runner adapter ([audit])
- ALWAYS: test-file pattern matching for `*.test.ts` and `*.test.tsx` is a pure function over file paths ([audit])
- ALWAYS: `relatedTestPaths` resolves direct and transitive TypeScript imports plus source-owned artifact dependency descriptors through injected candidate and module reads, returning paths without invoking Vitest ([audit])
- ALWAYS: every non-import source dependency consumed by the resolver originates in a readonly descriptor exported by the production module that owns the artifact ([audit])
- ALWAYS: the descriptor conforms to the `TestingLanguageDescriptor` contract per `spx/19-language-registration.adr.md` ([audit])
- ALWAYS: the descriptor's journal-streaming run accepts the evidence sink and the run-starter as injected dependencies — enables `l1` verification that the descriptor drives the run without a real Vitest run or mocking ([audit])
- ALWAYS: the journal-streaming run delegates its programmatic Vitest run and reporter to `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler`, so the descriptor constructs no reporter or journal event of its own ([audit])
- ALWAYS: the journal-streaming run is gated on the detection result like the CLI-flag run — it yields a gated-out run without invoking Vitest when TypeScript is absent, and starts the run only when detection passes ([audit])
- ALWAYS: a language-neutral consumer reaches the journal-streaming run through the testing registry enumeration per `spx/19-language-registration.adr.md`, never by importing the TypeScript descriptor or reporter module directly ([audit])
- NEVER: the journal-streaming run is selected through a `--reporter` command flag — the reporter is registered on the programmatically started run per `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` ([audit])
- NEVER: write to `vitest.config.ts`, `tsconfig.json`, or `package.json` — exclusions pass as invocation-time flags ([audit])
- NEVER: invoke vitest when TypeScript is absent — the descriptor's `detect` function calls `detectTypeScript` directly when no test override is provided ([audit])
- NEVER: import `execa` or `node:child_process` directly inside the runner functions — subprocess execution goes through the injected dependency ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, or module replacement for the command runner, language detector, candidate or module readers, or artifact descriptor — tests inject controlled implementations through the descriptor's public dependency boundaries ([audit])
- NEVER: hardcode language dispatch in orchestration — registration is through the descriptor per `spx/19-language-registration.adr.md` ([audit])
- NEVER: classify a source entrypoint as a root product input to stand in for its declared artifact dependency; root product inputs remain limited to files whose change affects the language's whole test surface ([audit])
- NEVER: require TypeScript consumers to use Vitest, `node_modules`, or a specific package-manager layout outside an explicitly selected adapter contract ([audit])
