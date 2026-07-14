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
  unverified for two of the four states the reporter's field map names.
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
`GENERATED_CASE_STATE`; `journal-reporter.md` Mappings assertion; the Vitest field map in
this node's `PLAN.md`.

## FOLLOW-UP: the recorder-backed sink needs a single-writer guarantee under multi-module runs

The reporter forwards each event to its injected `TestRunEvidenceSink` and awaits the
append, but it serializes nothing across hooks: if a run over multiple test modules
interleaves `onTestModuleStart`/`onTestCaseResult` appends, the sink sees overlapping
writes. The shipped reporter is a stateless translator with no racing state, and its tests
drive race-free recording sinks, so no evidence is dropped here. The race matters only once
the executor backs the sink with the recorder's evidence-append ports:
`createJournal().append()` (`src/lib/agent-run-journal/index.ts`) assigns `seq` from the
current history length and the appendable backend rejects a duplicate sequence, so
overlapping recorder-backed appends can race and drop or fail evidence before the run seals.

**Resolution:** when the executor (`spx/34-verification.enabler/43-execute.enabler`) wires
the recorder-backed sink, establish a single-writer guarantee — serialize the sink writes in
the executor's run driver, or make the reporter's `TestRunEvidenceSink` contract
single-writer and have the run queue appends — decided against Vitest's actual reporter-hook
dispatch order. Adding a write queue to the reporter itself is deferred here because the
reporter's `21-reporter-architecture.adr.md` keeps it a pure translator holding no execution
state, so the serialization belongs with the executor that owns the recorder-backed sink.

**Evidence:** CI review on PR #406; `src/test/languages/journal-reporter.ts`
`createJournalReporter`/`runTestsStreaming`; `src/lib/agent-run-journal/index.ts` `append`
sequence assignment.
