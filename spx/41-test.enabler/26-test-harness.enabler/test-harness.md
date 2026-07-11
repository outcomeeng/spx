# Testing Dispatch Test Harness

PROVIDES testing-command environments, real CLI registration, controlled runner and git boundaries, case registration, cleanup, and diagnostics driven by coherent testing scenarios
SO THAT `spx/41-test.enabler` behavior evidence, spec-domain status consumers, and language runner harnesses
CAN exercise dispatch, changed-set planning, execution recording, and output behavior without repeating product-directory setup, dependency bags, execution policy, or assertion configuration

## Assertions

### Scenarios

- Given a collected harness case list is empty, when the shared Vitest registration boundary receives it, then registration fails before the assertion file can silently contribute zero evidence ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the testing fixture writers (`withTestingTempProductDir`, `writeTestFileFixture`, `writeTestingConfig`, `writeTestingStateFile`) compose on the shared temp-directory primitive and stage config and run-state through the real production config and run-state paths rather than an injected value or a mock ([audit])
- ALWAYS: `runTestingCli` registers and runs the real testing CLI Commander program and captures stdout, stderr, and exit codes, so command tests exercise the real parse-and-dispatch path rather than a stubbed CLI ([audit])
- ALWAYS: the harness consumes coherent domains from `spx/41-test.enabler/17-test-generators.enabler` and owns reusable setup, controlled dependencies, cleanup, execution policy, and failure diagnostics ([audit])
- ALWAYS: `assertRecordingCommandRunnerContract` parametrizes over a language harness's recording-runner factory and that language's source-owned presence and exit-code generators, asserting the runner reports presence, records every invocation in order, and returns the configured exit code without spawning a process — so the python and typescript runner test-harness nodes verify their parallel recording runners through one shared contract ([audit])
- NEVER: executed testing assertion files construct dependency bags, fixture paths, runner settings, reusable values, or cleanup policy; they register harness cases and assert the governed outcome ([audit])
- NEVER: harness modules redeclare production-owned testing vocabulary or independently derive values owned by the testing generator ([audit])
- NEVER: this node restates the targeted-operand selection semantics governed by `spx/41-test.enabler/90-targeted-execution.enabler` — it governs the generator and harness contracts the operand tests build on, not the operand behavior itself ([audit])
