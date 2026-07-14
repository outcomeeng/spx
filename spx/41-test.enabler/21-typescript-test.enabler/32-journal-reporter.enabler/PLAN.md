# Plan: journal reporter build (post-decompose)

> Reconcile against this node's `journal-reporter.md` and
> `21-reporter-architecture.adr.md`, the child
> `32-test-harness.enabler/test-harness.md`, the parent
> `spx/41-test.enabler/21-typescript-test.enabler/PLAN.md`, and the program plan
> `spx/34-verification.enabler/PLAN.md` first. This note is coordination, not
> product truth.

## Composed structure

- `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` —
  the reporter (this node): the custom Vitest reporter + programmatic run.
  Governed by `21-reporter-architecture.adr.md`.
- `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler/32-test-harness.enabler` —
  the reporter's test infrastructure (recording evidence sink, spy Vitest
  run-starter, run-scenario generator), governed beside the reporter whose tests
  consume it, per `spx/12-test-infrastructure.adr.md`. Index 32, above the ADR at
  21 that constrains it.

Both are Declared and in `spx/EXCLUDE`.

## Progress (this session)

Delivered and committed on `feat/test-verification-reporter`:

- `32-test-harness.enabler` — implemented and GREEN (recording sink, spy
  run-starter, run-scenario generator; `test-harness.property.l1.test.ts` passes).
- Reporter evidence contract — `src/test/languages/journal-reporter.ts`: producer
  types, `TestRunEvidenceSink` port, terminal-status registry, `VitestRunStarter`
  contract.
- Reporter translation behavior — `createJournalReporter` (module -> scope,
  failing case -> finding, passing case -> none, run-end reason -> terminal
  status) and `runTestsStreaming` (registers the reporter on an injected starter).
- Reporter `l1` evidence — `journal-reporter.mapping.l1.test.ts` and
  `journal-reporter.compliance.l1.test.ts` (mapping, per-hook streaming,
  programmatic registration) pass. `pnpm run validate` green.
- Reporter `scenario.l2` — real programmatic Vitest run. `createVitestRunStarter`
  (`src/test/languages/journal-reporter.ts`) starts Vitest through
  `startVitest("test", [...testPaths], { root, watch: false, reporters })` via a
  lazy `import("vitest/node")`, closes the instance, and restores `process.exitCode`
  around the run. The run streams over `testing/fixtures/vitest/mixed.test.ts.fixture`
  (one passing, one runtime-failing case in one module), materialized by
  `withMixedVitestProject` into an isolated temp project. `startVitest` nested inside
  the outer Vitest worker executes cleanly — no subprocess harness needed. The sink
  observes one scope and one finding; `journal-reporter.scenario.l2.test.ts` passes.

Both nodes remain in `spx/EXCLUDE` pending graduation.

## Remaining for the reporter node

1. **Graduate both nodes.** Remove the two `spx/EXCLUDE` entries, then regenerate
   `spx.status.json` via the `CLAUDE.md` procedure (`pnpm run build` ->
   `tsx src/cli.ts test passing` -> `tsx src/cli.ts spec status --update`); never
   hand-edit status.
2. **Audits + review.** `/apply` gates over the changeset: `test-evidence-auditor`,
   `implementation-auditor`, then the whole-changeset `changes-reviewer` (this is
   a cross-node change touching `src/` and `testing/`).

## Then the rest of slice 1

Per `spx/34-verification.enabler/PLAN.md`: the executor
(`spx/34-verification.enabler/43-execute.enabler` + `src/commands/verification-exec/`,
wiring the reporter through `src/test/registry.ts` and registering the `test`
type's validators in the recorder), the `spx verification test run` command path
(`spx/60-surfaces.enabler/21-cli-surface.enabler`), and the fold path in
`spx spec status --update` (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler`).
Then `/merge`.

## Build order (both nodes)

The recording sink implements the reporter's `TestRunEvidenceSink` port and the
generator produces the reporter's input domain, so the reporter's source type
contracts are the shared contract both nodes build against.

1. **Reporter source type contracts** (`src/test/languages/`, TypeScript-specific
   per `spx/19-language-registration.adr.md`): `TestScopeUnit` (`{ moduleId }`),
   `TestFinding` (`{ moduleId, testName, errors }`), `TestRunEvidenceSink`
   (`appendScope` / `appendFinding`), `JournalRunTerminalStatus`
   (`passed` | `failed` | `interrupted`). These are the contract downstream code
   and tests import.
2. **/apply the test-harness child** (`32-test-harness.enabler`): tests (property
   `l1` for the recording sink and the generator) then implementation in
   `testing/harnesses/` and `testing/generators/` — the recording sink
   implementing `TestRunEvidenceSink`, the spy run-starter, the run-scenario
   generator (`fc.Arbitrary` over module id + cases with pass/fail state and error
   text; reuse `arbitraryTestFilePath` / literal generators where they fit, add a
   scenario generator otherwise).
3. **/apply the reporter** (`32-journal-reporter.enabler`): tests then
   implementation.
   - `journal-reporter.mapping.l1.test.ts` — hook-to-evidence mapping over
     generated scenarios: module -> scope, failing case -> finding, passing case
     -> no finding, run-end reason -> terminal status.
   - `journal-reporter.compliance.l1.test.ts` — appends via injected sink not
     direct events; each event as its hook fires (streams before `onTestRunEnd`);
     reporter registered on a programmatically started Vitest run through the Node
     API, not a `--reporter` flag (spy run-starter).
   - `journal-reporter.scenario.l2.test.ts` — real programmatic Vitest run over a
     single module holding one passing and one failing case. The failing case is a
     runtime assertion failure, not the sibling `failing.test.ts.fixture`'s missing
     import: an import error faults the module before any case resolves, so it emits
     no `onTestCaseResult` finding. The dedicated
     `testing/fixtures/vitest/mixed.test.ts.fixture` supplies both cases in one
     module; the recording sink observes one scope and one finding.
   - Implementation: the pure translator reporter (implements Vitest's `Reporter`,
     Vitest 4.1.10: `onTestModuleStart/End`, `onTestCaseResult`, `onTestRunEnd`),
     the programmatic run through `startVitest` with the reporter registered, and
     the `TestingLanguageDescriptor` journal-streaming operation the executor
     reaches via `src/test/registry.ts`.
4. **Un-EXCLUDE** each node once its tests pass; regenerate committed status via
   the graduation procedure in `CLAUDE.md` (never hand-edit `spx.status.json`).

## Vitest 4.1.10 field map (grounding for /apply)

- `TestModule.moduleId: string` -> scope unit identity.
- `TestCase.module.moduleId`, `TestCase.fullName`, `TestCase.result().state`
  (`passed` | `failed` | `skipped` | `pending`), `result().errors` (on failed) ->
  finding fields for a failing case; passing case appends nothing.
- `onTestRunEnd(testModules, unhandledErrors, reason)` with
  `reason: "passed" | "interrupted" | "failed"` -> `JournalRunTerminalStatus`; the
  executor seals the run with it (`spx/34-verification.enabler/43-execute.enabler`).
