# Reporter Test Harness

PROVIDES the journal-reporter test fixtures — a recording evidence sink that captures the reporter's scope and finding appends, an async recording sink whose appends resolve only on a macrotask boundary, a spy Vitest run-starter that records how a journal-streaming run starts Vitest, a scenario-driving Vitest run-starter that drives every reporter registered on the run through its lifecycle hooks over a generated scenario and seals with a given terminal reason, a generator for reporter run scenarios (a module id with pass and fail cases and error text), and a mixed-case Vitest fixture materialized into an isolated temp project for the reporter's real programmatic run
SO THAT the `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler` tests and the `spx/41-test.enabler/21-typescript-test.enabler` descriptor journal-streaming tests
CAN verify the hook-to-evidence translation and streaming at `l1` through recorded sink calls, prove each reporter hook awaits its sink append by driving the reporter with the async sink, assert programmatic Node-API registration without spawning Vitest, stream a generated scenario's scope and finding evidence into a sink through a descriptor's journal-streaming run without spawning Vitest, draw reporter input from a generator rather than hardcoded module ids, case names, or error text, and drive a real programmatic Vitest run at `l2` over a single module holding one passing and one failing case

## Assertions

### Properties

- The recording evidence sink records every `appendScope` and `appendFinding` call in invocation order, preserving the order across interleaved scope and finding calls, and returns the recorded calls to the consuming test ([test](tests/test-harness.property.l1.test.ts))
- The async recording sink records each `appendScope` and `appendFinding` only after a macrotask boundary — a not-yet-awaited append and a microtask tick record nothing, and only awaiting the append records it — so a consumer that fires the append without awaiting records nothing ([test](tests/test-harness.property.l1.test.ts))
- The run-scenario generator yields a module id paired with cases whose pass and fail states and error text vary across draws, and every generated failing case carries error text ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the recording evidence sink is a pure in-memory double implementing the reporter's `TestRunEvidenceSink` port — it records calls without constructing a journal event or performing I/O ([audit])
- ALWAYS: the async recording sink is a pure in-memory double implementing the reporter's `TestRunEvidenceSink` port whose appends resolve on a macrotask boundary — it records calls constructing no journal event and touching no filesystem, process, or network ([audit])
- ALWAYS: the spy run-starter records the Vitest start options a journal-streaming run supplies, including the registered reporters and the absence of a `--reporter` command flag, without spawning Vitest ([audit])
- ALWAYS: the scenario-driving run-starter records the Vitest start options a journal-streaming run supplies and, on start, drives every reporter registered on the run through its lifecycle hooks over the generated scenario — one module scope and a finding per failing case — sealing the run with the given terminal reason, without spawning Vitest ([audit])
- ALWAYS: the run-scenario generator holds the reporter's input field vocabulary independently of the reporter source, so a divergence between the generated shape and the reporter's consumed shape fails a consuming test ([audit])
- ALWAYS: the real-run fixture is a committed inert suite holding one passing case and one runtime-failing case in a single module, materialized into an isolated temp project outside the repository so the reporter's programmatic run resolves it under Vitest defaults with no inherited product configuration ([audit])
