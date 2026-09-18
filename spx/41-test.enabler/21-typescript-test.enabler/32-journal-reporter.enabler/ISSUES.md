# Issues: Journal Reporter

> Coordination note, not product truth. Reconcile against this node's
> `journal-reporter.md`, `21-reporter-architecture.adr.md`, the child
> `32-test-harness.enabler/test-harness.md`, and the executor spec
> `spx/34-verification.enabler/43-execute.enabler/execute.md` before acting.

## FOLLOW-UP: the reporter's evidence model covers only passing/failing cases in cleanly-collecting modules

The slice-1 reporter (`src/test/languages/journal-reporter.ts`) translates three
Vitest lifecycle paths: a started module records a scope, a `failed` case records a
finding, and run end captures the terminal status. Three further Vitest lifecycle
paths are undriven, so the journal can lose a failure or leave a mapping claim
unverified:

- **`skipped` / `pending` case states.** Vitest's `TestCase.result().state` is
  `passed | failed | skipped | pending`, but the run-scenario generator
  (`GENERATED_CASE_STATE`, `testing/generators/testing/journal-reporter.ts`) draws only
  `PASSED`/`FAILED`. `onTestCaseResult` branches on `result.state !== "failed"`, so it
  treats `skipped`/`pending` as no-finding — the same as passing — but no generator,
  fixture, or test drives those two states, so `journal-reporter.md`'s Mappings claim
  ("a failing test case records a finding, a passing test case records no finding") is
  unverified for two of the four states the reporter's source contract names.
- **A module whose collection fails before any case resolves.** An import or syntax
  error faults a module during collection, so it emits no `onTestCaseResult` and appends
  no finding; if Vitest also skips `onTestModuleStart` for it, the run resolves `failed`
  with zero scope and zero finding, silently losing the failure from the journal.
- **Run-level errors at `onTestRunEnd`.** Vitest passes collection/setup failures and
  unhandled async errors to `onTestRunEnd`'s `errors` argument, which the reporter
  ignores — it records only the terminal status — so a failed run's run-level errors
  reach no finding evidence.

**Resolution:** all three are outside the reporter's slice-1 scope (per-module scope,
per-failing-case finding) and settle with the executor slice
(`spx/34-verification.enabler/43-execute.enabler`), which owns terminal sealing and backs
the sink with the recorder. Determine Vitest's lifecycle for each undriven path, then
decide the evidence: extend `GENERATED_CASE_STATE` and the mapping coverage to
`skipped`/`pending`; add a collection-failure fixture; and decide whether a
collection-failure module and `onTestRunEnd`'s `errors` record scope and/or finding
evidence. Amend `journal-reporter.md` and `21-reporter-architecture.adr.md` to state the
fuller evidence contract when that work lands.

**Evidence:** CI review on PR #406; `src/test/languages/journal-reporter.ts`
`onTestCaseResult`/`onTestRunEnd`; `testing/generators/testing/journal-reporter.ts`
`GENERATED_CASE_STATE`; and the `journal-reporter.md` Mappings assertion.
