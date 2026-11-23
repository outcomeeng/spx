---
id: 01a2049f-5040-76b7-b31f-0aa726efddd9
---

# Signal Target Harness

PROVIDES an in-memory `SignalTarget` implementation
SO THAT foreground-handoff signal-suspension tests
CAN verify listener removal, ignore-listener installation, listener restoration, and listener-list isolation without mutating the real process signal registry

## Assertions

### Test.Scenario: listener isolation

- [listeners-returns-copy](tests/signal-target-harness.scenario.l1.test.ts):
  - Given a recording signal target constructed with one listener for `SIGINT` and none for `SIGTERM`
  - When a caller appends a second listener to the array that `listeners("SIGINT")` returns
  - Then `listeners("SIGINT")` still returns only the first listener, and `listeners("SIGTERM")` returns an empty array

### Test.Property: listener registry

- [on-and-remove](tests/signal-target-harness.property.l1.test.ts): For every sequence of add and remove operations over `SIGINT` and `SIGTERM` and a pool of three listeners, `on` appends the listener to its signal's list and `removeListener` removes only the first matching listener of its signal, so `listeners` of each signal returns the list a reference model of those operations holds
- [construction-clones](tests/signal-target-harness.property.l1.test.ts): For every initial map of `SIGINT` and `SIGTERM` to listener lists drawn from a pool of three listeners, a recording signal target copies each list at construction, so a listener appended to an original list afterwards leaves `listeners` of that signal unchanged

### Audit: collaborator design

- in-memory-signal-target: ALWAYS: `testing/harnesses/process-lifecycle/signal-target.ts` implements the production `SignalTarget` interface as a pure in-memory recording collaborator; a harness that installs or removes a listener on the real `process` fails.
- signal-target-test-values: ALWAYS: the tests of this harness draw their signal operations and initial listener maps from generators that `testing/generators/process-lifecycle/signal-target.ts` exports, and run each property through the property harness; a test of this Node that declares its own arbitrary or draws from a generator another Node owns fails.
