# Reporter Test Harness

PROVIDES the journal-reporter test fixtures — a recording evidence sink that captures the reporter's scope and finding appends, a spy Vitest run-starter that records how a journal-streaming run starts Vitest, and a generator for reporter run scenarios (a module id with pass and fail cases and error text)
SO THAT the `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` tests
CAN verify the hook-to-evidence translation and streaming at `l1` through recorded sink calls, assert programmatic Node-API registration without spawning Vitest, and draw reporter input from a generator rather than hardcoded module ids, case names, or error text

## Assertions

### Properties

- The recording evidence sink records every `appendScope` and `appendFinding` call in invocation order and returns the recorded calls to the consuming test ([test](tests/test-harness.property.l1.test.ts))
- The run-scenario generator yields a module id paired with cases whose pass and fail states and error text vary across draws, and every generated failing case carries error text ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the recording evidence sink is a pure in-memory double implementing the reporter's `TestRunEvidenceSink` port — it records calls without constructing a journal event or performing I/O ([audit])
- ALWAYS: the spy run-starter records the Vitest start options a journal-streaming run supplies, including the registered reporters and the absence of a `--reporter` command flag, without spawning Vitest ([audit])
- ALWAYS: the run-scenario generator holds the reporter's input field vocabulary independently of the reporter source, so a divergence between the generated shape and the reporter's consumed shape fails a consuming test ([audit])
