---
id: 01a2049f-5040-76b7-b31f-0aa6704bffd0
---

# Lifecycle Recording Harness

PROVIDES recording `ChildHandle` and `ExitController` implementations
SO THAT process-lifecycle tests
CAN verify signal cleanup, kill-call recording, exit-code recording, and listener notification through dependency-injected collaborators without replacing the production lifecycle module

## Assertions

### Test.Scenario: exit listeners

- [exit-listeners-in-order](tests/lifecycle-recording-harness.scenario.l1.test.ts):
  - Given a recording child with two exit listeners registered one after the other
  - When `triggerExit` runs with exit code 0
  - Then the first listener and then the second listener each receive exit code 0, and neither receives any other call

### Test.Property: recording

- [kill-calls-recorded](tests/lifecycle-recording-harness.property.l1.test.ts): For every non-empty sequence of kill values drawn from `SIGINT`, `SIGTERM`, and the exit codes 0, 1, 130, and 143, a recording child appends each value to `killCalls` in order, returns `true` for the first kill alone, and reads `killed` true from the first kill on
- [exits-recorded](tests/lifecycle-recording-harness.property.l1.test.ts): For every sequence of exit codes drawn from 0, 1, 130, and 143, the empty sequence included, a recording exit controller appends each requested code to `exits` in order

### Audit: collaborator design

- in-memory-collaborators: ALWAYS: `testing/harnesses/process-lifecycle/lifecycle.ts` implements the production `ChildHandle` and `ExitController` interfaces as pure in-memory recording collaborators that consuming tests receive through dependency injection; a framework mock, a real process or signal side effect, or a replaced production lifecycle module fails.
- lifecycle-test-values: ALWAYS: the tests of this harness draw their kill values and exit codes from generators that `testing/generators/process-lifecycle/lifecycle.ts` exports, and run each property through the property harness; a test of this Node that declares its own arbitrary or draws from a generator another Node owns fails.
