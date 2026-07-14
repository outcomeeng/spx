# Issues: Journal Reporter

> Coordination note, not product truth. Reconcile against this node's
> `journal-reporter.md`, `21-reporter-architecture.adr.md`, the child
> `32-test-harness.enabler/test-harness.md`, and the executor spec
> `spx/34-verification.enabler/43-execute.enabler/execute.md` before acting.

## FOLLOW-UP: a module whose collection fails before any case resolves streams no evidence

`createJournalReporter` (`src/test/languages/journal-reporter.ts`) records a scope on
`onTestModuleStart` and a finding on each failing `onTestCaseResult`. A module whose
collection fails before any case resolves — an import error, a top-level throw — emits no
`onTestCaseResult`, so it appends no finding; if Vitest also skips `onTestModuleStart` for
such a module, the run resolves with a `failed` terminal status yet zero scope and zero
finding evidence, so the journal loses the failure. The mapping generator
(`GENERATED_CASE_STATE` in `testing/generators/testing/journal-reporter.ts`) yields only
`PASSED`/`FAILED` case states, and the `l2` fixture (`testing/fixtures/vitest/mixed.test.ts.fixture`)
exercises only a runtime assertion failure inside a module that collects cleanly, so no
test in this node drives the collection-failure path.

**Resolution:** determine Vitest's lifecycle for a collection-failure module — whether
`onTestModuleStart` fires and whether the module surfaces through `onTestRunEnd`'s
`testModules`/`unhandledErrors` — then decide whether the reporter records a scope and a
module-level finding for it. Amend `journal-reporter.md` and `21-reporter-architecture.adr.md`
to state the collection-failure contract, add a generator case state and a fixture that
faults during collection, and cover the path. Settle alongside the executor's `/apply`
(`spx/34-verification.enabler/43-execute.enabler`), which seals the run and owns the
terminal status the failure must reach.

**Evidence:** CI review on PR #406; `src/test/languages/journal-reporter.ts`
`onTestModuleStart`/`onTestCaseResult`; `testing/generators/testing/journal-reporter.ts`
`GENERATED_CASE_STATE`; `testing/fixtures/vitest/mixed.test.ts.fixture`.

## FOLLOW-UP: the recorder-backed sink needs a single-writer guarantee under multi-module runs

The reporter forwards each event to its injected `TestRunEvidenceSink` and awaits the append,
but it serializes nothing across hooks: if a run over multiple test modules interleaves
`onTestModuleStart`/`onTestCaseResult` appends, the sink sees overlapping writes. The shipped
reporter is a stateless translator with no racing state, and its tests drive race-free
recording sinks, so no evidence is dropped here. The race matters only once the executor backs
the sink with the recorder's evidence-append ports: `createJournal().append()`
(`src/lib/agent-run-journal/index.ts`) assigns `seq` from the current history length and the
appendable backend rejects a duplicate sequence, so overlapping recorder-backed appends can
race and drop or fail evidence before the run seals.

**Resolution:** when the executor (`spx/34-verification.enabler/43-execute.enabler`) wires the
recorder-backed sink, establish a single-writer guarantee — serialize the sink writes in the
executor's run driver, or make the reporter's `TestRunEvidenceSink` contract single-writer and
have the run queue appends — decided against Vitest's actual reporter-hook dispatch order.
Adding a write queue to the reporter itself is deferred here because the reporter's
`21-reporter-architecture.adr.md` keeps it a pure translator holding no execution state, so the
serialization belongs with the executor that owns the recorder-backed sink.

**Evidence:** CI review on PR #406; `src/test/languages/journal-reporter.ts`
`createJournalReporter`/`runTestsStreaming`; `src/lib/agent-run-journal/index.ts` `append`
sequence assignment.
