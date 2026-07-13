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
     fixture module with one passing and one failing case (reuse the committed
     `testing/fixtures/vitest/{passing,failing}.test.ts.fixture` that the sibling
     `spx/41-test.enabler/21-typescript-test.enabler/32-test-harness.enabler`
     already uses); recording sink observes one scope and one finding.
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
