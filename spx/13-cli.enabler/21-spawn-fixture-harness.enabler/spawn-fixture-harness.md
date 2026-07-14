# Spawn Fixture Harness

PROVIDES a subprocess fixture that spawns a command, captures stderr, counts observed stdout bytes, can destroy the parent's stdout read end after a delay or after observing a configured stdout marker, and maps signal exits through the POSIX `128 + signal` convention
SO THAT the `spx/13-cli.enabler` lifecycle EPIPE smoke test
CAN exercise a real child process while keeping Node event names, stream handling, stderr encoding, and signal-to-exit-code translation inside one governed harness

## Assertions

### Scenarios

- Given a child command that writes stdout, writes stderr, and exits with a numeric status, when `runSpawnFixture` runs it, then the result reports the exit status, captured stderr text, and the number of stdout bytes observed ([test](tests/spawn-fixture-harness.scenario.l1.test.ts))
- Given a child command that remains alive until it receives SIGTERM, when the fixture's spawned child terminates from SIGTERM, then the result reports exit code 143 ([test](tests/spawn-fixture-harness.scenario.l1.test.ts))
- Given a child command that terminates from a standard non-SIGTERM signal, when the fixture's spawned child terminates from that signal, then the result reports the conventional POSIX exit code from the source-owned signal-number table ([test](tests/spawn-fixture-harness.scenario.l1.test.ts))
- Given a child command cannot be spawned, when `runSpawnFixture` observes the spawn error, then the result settles with the source-owned unknown-exit code ([test](tests/spawn-fixture-harness.scenario.l1.test.ts))
- Given a child emits a configured stdout marker, when marker-triggered closure is requested, then the fixture reports the marker as observed before destroying the parent's stdout read end ([test](tests/spawn-fixture-marker.scenario.l1.test.ts))

### Compliance

- ALWAYS: the fixture uses a real subprocess and real stdio streams, so the EPIPE smoke test exercises Node's process and stream boundary instead of a fake child process ([audit])
- ALWAYS: signal exits with an unknown signal return `-1` ([audit])
