---
id: 01a2034e-dbcc-7098-ad39-1afc470aa629
---

# Testing Dispatch Test Harness

PROVIDES testing-command environments, real CLI registration, controlled runner and git boundaries, case registration, cleanup, and diagnostics driven by coherent testing scenarios
SO THAT any test that exercises the testing command or a language runner
CAN exercise dispatch, changed-set planning, execution recording, and output behavior without repeating product-directory setup, dependency bags, execution policy, or assertion configuration

## Test.Scenario: case registration

- [empty-case-list-fails](tests/test-harness.scenario.l1.test.ts):
  - Given a collected harness case list is empty
  - When the shared Vitest registration boundary receives it
  - Then registration fails before the assertion file can silently contribute zero evidence

## Audit: harness composition

- fixture-writers-real-paths: ALWAYS: the testing fixture writers (`withTestingTempProductDir`, `writeTestFileFixture`, `writeTestingConfig`, `writeTestingStateFile`) compose on the shared temp-directory primitive and stage config and run-state through the real production config and run-state paths rather than an injected value or a mock
- real-cli-program: ALWAYS: `runTestingCli` registers and runs the real testing CLI Commander program and captures stdout, stderr, and exit codes, so command tests exercise the real parse-and-dispatch path rather than a stubbed CLI
- harness-owns-setup: ALWAYS: the harness consumes coherent domains from `spx/41-test.enabler/17-test-generators.enabler` and owns reusable setup, controlled dependencies, cleanup, execution policy, and failure diagnostics
- shared-recording-observation: ALWAYS: `observeRecordingCommandRunner` parametrizes over a language harness's recording-runner factory and that language's source-owned presence and exit-code inputs, drives the generated invocations through the runner without spawning a process, and returns the reported presence, per-call exit codes, and recorded calls, so each language's runner test harness asserts its recording runner over one shared observation
- no-assertion-file-setup: NEVER: an executed testing assertion file constructs dependency bags, fixture paths, runner settings, reusable values, or cleanup policy; it registers harness cases and asserts the governed outcome
- no-redeclared-vocabulary: NEVER: a harness module redeclares production-owned testing vocabulary or independently derives a value the testing generator owns
- no-operand-semantics: NEVER: this Node's spec states targeted-operand selection semantics; it governs the generator and harness contracts the operand tests build on, and leaves the operand behavior to the Node that owns it
