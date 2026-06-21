# Launch Runner Test Harness

PROVIDES a recording agent-launch process runner — `RecordingLaunchRunner` capturing each spawn's command, args, and options and handing back a `RecordingLaunchChild` the test drives via `emitExit` and `emitError`, plus `RecordingSuspender` counting signal suspend and restore calls
SO THAT the session-pick enabler's launch-agent L1 scenarios
CAN drive the launcher's exit, spawn-failure, and signal-suspension paths without spawning a real process or touching real signal handling

## Assertions

### Properties

- For all spawn sequences, `RecordingLaunchRunner` records each spawn's command, args, and options — an empty record when none are passed — in order, appending one `RecordingLaunchChild` per spawn whose `kill` returns `true` and records the kill, and a `RecordingSuspender`'s suspend returns a restore so the suspend and restore counts each reach one after a suspend-then-restore ([test](tests/launch-runner-test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: `RecordingLaunchChild` models a clean exit, a signal exit, and a spawn failure through `emitExit` and `emitError` rather than a real child process — the harness spawns no real process and forwards no real signals, injecting a controlled `ProcessRunner` rather than mocking the spawn primitive, per [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../../13-cli.enabler/15-cli-architecture.adr.md) ([audit](../../../13-cli.enabler/15-cli-architecture.adr.md))
