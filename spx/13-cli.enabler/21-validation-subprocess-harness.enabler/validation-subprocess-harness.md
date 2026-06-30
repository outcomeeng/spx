# Validation Subprocess Harness

PROVIDES recording validation subprocess collaborators — a child process with pass-through stdout and stderr, kill and close controls, and a `ProcessRunner` that records commands, arguments, spawn options, and spawned children
SO THAT the `spx/13-cli.enabler` lifecycle compliance tests and the validation subprocess tests
CAN verify managed-subprocess wiring, spawn-option propagation, stream forwarding, and lifecycle-runner injection through one shared governed harness

## Assertions

### Scenarios

- Given a recording validation child, when `closeSuccessfully` runs, then the child emits the validation success close event expected by validation subprocess consumers ([test](tests/validation-subprocess-harness.scenario.l1.test.ts))

### Properties

- For every sequence of spawn calls, a recording spawn-options runner appends commands, argument arrays, options, and children in call order, and `spawnOptions` returns the latest recorded options ([test](tests/validation-subprocess-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the recording validation child exposes pass-through stdout and stderr streams and a child-process-compatible event surface, so consuming tests observe stream forwarding through real stream objects rather than framework mocks ([audit])
- ALWAYS: the shared harness governs `testing/harnesses/validation/subprocess.ts` for both the CLI lifecycle compliance tests and validation tests, so the module has one spec owner and no duplicate harness contract ([audit])
