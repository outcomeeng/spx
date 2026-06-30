# Signal Target Harness

PROVIDES an in-memory `SignalTarget` implementation for the foreground handoff signal-suspension tests
SO THAT the `spx/13-cli.enabler` foreground-handoff tests
CAN verify listener removal, ignore-listener installation, listener restoration, and listener-list isolation without mutating the real process signal registry

## Assertions

### Scenarios

- Given a recording signal target with initial listeners for a signal, when `listeners` is called and the returned array is mutated by the caller, then the target's stored listener set remains unchanged ([test](tests/signal-target-harness.scenario.l1.test.ts))

### Properties

- For every signal and listener sequence, calling `on` appends listeners in order and `removeListener` removes only the first matching listener while leaving non-matching listeners unchanged ([test](tests/signal-target-harness.property.l1.test.ts))
- For every initial signal-listener map, constructing a recording signal target clones each listener list so later mutation of the original map entries does not change the target's stored listeners ([test](tests/signal-target-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the harness implements the production `SignalTarget` interface as a pure in-memory recording collaborator, so consuming tests verify signal-suspension behavior without installing or removing real process listeners ([audit])
