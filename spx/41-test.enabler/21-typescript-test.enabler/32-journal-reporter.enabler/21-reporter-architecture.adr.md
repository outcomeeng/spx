# Journal Reporter Architecture

The TypeScript journal-streaming test run starts Vitest in-process through its Node API with a custom reporter registered on the run's reporters, so the run exposes its per-module and per-case lifecycle hooks to an in-process object rather than returning only a terminal exit code. The reporter is a pure translator: each Vitest lifecycle event it observes it forwards to an injected `TestRunEvidenceSink` — a started or ended test module becomes a scope append, a failing test case a finding append, a passing case nothing — constructing no journal events, performing no I/O, and holding no state beyond the in-flight module it is scoping. The Vitest run starter and the evidence sink are injected dependencies; this node owns the `TestScopeUnit`, `TestFinding`, and `TestRunEvidenceSink` types the reporter produces against, and the language-neutral verification executor reaches this run through the testing registry (`src/test/registry.ts`) per `spx/19-language-registration.adr.md`, never by naming the language.

## Rationale

Vitest exposes per-module and per-case lifecycle hooks (`onTestModuleStart`/`onTestModuleEnd`, `onTestCaseResult`, `onTestRunEnd`) only to a reporter registered on an in-process run started through its Node API. The command-flag runner of `spx/41-test.enabler/21-typescript-test.enabler` returns a single terminal exit code over a batch of paths, so it cannot surface per-reference evidence as cases resolve. The two run paths are distinct product capabilities: the command-flag runner serves `spx test` with exclusion flags and exit-code aggregation, and the journal-streaming run serves the spx-driven `test` verification run with live per-reference evidence.

Making the reporter a pure translator over an injected sink keeps the hook-to-evidence mapping verifiable at `l1` — constructed Vitest lifecycle values in, recorded sink calls out — without invoking real Vitest and without mocking, and decouples the reporter from the run journal: the executor of `spx/34-verification.enabler/43-execute.enabler` supplies the real sink backed by the recorder's evidence-append ports, while tests supply a recording sink. Owning the producer types here, rather than importing the recorder's `test`-type evidence model, lets this run be built and verified before the executor wires the recorder; the executor adapts these producer types to the recorder's evidence model when it registers the `test` type. Terminal completion is not this run's to record — the executor opens and seals the recorder run per `spx/34-verification.enabler/43-execute.enabler`, so the reporter yields a terminal status from Vitest's run-end reason and streams only scope and finding.

Rejected: routing the streaming run through the command-flag `runTests` operation, which returns an exit code and exposes no lifecycle hooks; having the reporter append journal events directly, which couples the TypeScript reporter to the journal substrate and duplicates the recorder's event construction that `spx/34-verification.enabler/32-verify.enabler` forbids a caller performing; and replacing Vitest with `vi.mock()`, which violates the reality principle where an injected run starter drives synthetic lifecycle events at `l1` and real Vitest at `l2`.

## Invariants

- The reporter forwards to the sink once per mapped Vitest lifecycle event: one scope append per test module, one finding append per failing test case, and no append for a passing case.
- The reporter constructs no journal event, opens or seals no verification run, and reads or writes no file — every durable effect flows through the injected `TestRunEvidenceSink`.
- The journal-streaming run and the command-flag `runTests` invocation share no command construction: exclusion flags and exit-code aggregation belong to the command-flag path, and lifecycle hooks belong to the streaming path.

## Verification

### Audit

- ALWAYS: the journal-streaming run accepts a dependency-injected Vitest run starter, so `l1` tests drive synthetic lifecycle events and `l2` drives real Vitest, neither mocking Vitest ([audit])
- ALWAYS: the reporter forwards lifecycle events to a dependency-injected `TestRunEvidenceSink` parameter rather than importing the recorder domain or the journal substrate ([audit])
- ALWAYS: the reporter is a pure translator — its lifecycle methods compute sink calls from their event arguments and the in-flight scope only, with no filesystem, process, clock, or network access ([audit])
- ALWAYS: the journal-streaming run is a TypeScript-scoped operation owned in `src/test/languages/journal-reporter.ts`, so reaching it stays within the language layer and keeps a language-neutral executor free of language names per `spx/19-language-registration.adr.md` ([audit])
- ALWAYS: the reporter and its `TestScopeUnit`, `TestFinding`, and `TestRunEvidenceSink` producer types live in a TypeScript test-language module under `src/test/languages/`, keeping the executor language-neutral per `spx/19-language-registration.adr.md` ([audit])
- NEVER: the reporter constructs a journal event, opens or seals a verification run, or writes evidence to disk — durable effects flow only through the injected sink ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module replacement stands in for Vitest or the evidence sink — the run starter and sink are injected through their interfaces ([audit])
- NEVER: the journal-streaming run reuses the command-flag `runTests` invocation or its `--reporter` or `--exclude` command construction — it starts Vitest through the Node API with the reporter registered on the run ([audit])
