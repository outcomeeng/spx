# Lifecycle Recording Harness

PROVIDES recording `ChildHandle` and `ExitController` implementations for the process-lifecycle test suite
SO THAT the `spx/13-cli.enabler` lifecycle mapping, scenario, and property tests
CAN verify signal cleanup, kill-call recording, exit-code recording, and listener notification through dependency-injected collaborators without replacing the production lifecycle module

## Assertions

### Scenarios

- Given a recording child with registered exit listeners, when `triggerExit` runs with a code, then every listener receives that code in registration order ([test](tests/lifecycle-recording-harness.scenario.l1.test.ts))

### Properties

- For every non-empty sequence of kill signals or numeric codes, a recording child appends each value to `killCalls` in order, returns `true` only for the first kill, and keeps `killed` true after the first kill ([test](tests/lifecycle-recording-harness.property.l1.test.ts))
- For every sequence of exit codes, a recording exit controller appends each requested code to `exits` in order ([test](tests/lifecycle-recording-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the harness implements the production `ChildHandle` and `ExitController` interfaces as pure in-memory recording collaborators, so consuming tests observe lifecycle interactions through dependency injection rather than framework mocks ([audit])
