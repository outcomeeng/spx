# Journal Reporter

PROVIDES a custom Vitest reporter and the programmatic Vitest run that hosts it, translating a TypeScript test run's per-module and per-case lifecycle events into scope and finding evidence appended through an injected evidence sink
SO THAT the spx-driven verification executor of `spx/34-verification.enabler/43-execute.enabler`, driving this product's TypeScript test runner through `src/test/registry.ts`,
CAN stream per-module scope and per-failing-case findings into the run journal live as cases resolve, without spawning the Vitest CLI or constructing journal events directly

## Assertions

### Mappings

- Vitest run-lifecycle events map to scope and finding evidence: a test module records a scope event, a failing test case records a finding, a passing test case records no finding, and run end yields the terminal status the executor seals the run with ([test](tests/journal-reporter.mapping.l1.test.ts))

### Scenarios

- Given a programmatic Vitest run with the reporter injected over a module holding one passing and one failing case, when the run resolves the cases, then the reporter records a scope event covering the module and a finding for the failing case, and records no finding for the passing case ([test](tests/journal-reporter.scenario.l2.test.ts))

### Compliance

- ALWAYS: the reporter appends scope and finding evidence through its injected `TestRunEvidenceSink` port, never by constructing journal events directly or importing the recorder domain of `spx/34-verification.enabler/32-verify.enabler` — the executor backs that sink with the recorder's evidence-append ports ([audit])
- ALWAYS: the reporter appends each scope and finding event as its corresponding Vitest hook fires, so the run streams to the journal before it completes rather than batching at run end ([test](tests/journal-reporter.compliance.l1.test.ts))
- ALWAYS: the reporter is registered on a programmatically started Vitest run through the Node API, not selected by a `--reporter` command flag, so the run exposes its lifecycle hooks to the reporter ([test](tests/journal-reporter.compliance.l1.test.ts))
