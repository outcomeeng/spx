---
id: 01a2049f-5040-76b7-b31f-0aa887371b5a
---

# Spawn Fixture Harness

PROVIDES a subprocess fixture that spawns a command, captures stderr, counts observed stdout bytes, can destroy the parent's stdout read end after a delay or after observing a configured stdout marker, and maps signal exits through the POSIX `128 + signal` convention
SO THAT process-lifecycle tests at the real process boundary
CAN exercise a real child process while keeping Node event names, stream handling, stderr encoding, and signal-to-exit-code translation inside one governed harness

## Assertions

### Test.Scenario: result capture

- [result-captured](tests/spawn-fixture-harness.scenario.l1.test.ts):
  - Given a Node child that writes a text of lowercase letters followed by the two-byte character U+0111 to stdout, writes a text of lowercase letters to stderr, and exits with status 130
  - When `runSpawnFixture` runs it
  - Then the result reports exit code 130, the stderr text unchanged, and the UTF-8 byte count of the stdout text as the stdout bytes observed
- [sigterm-exit](tests/spawn-fixture-harness.scenario.l1.test.ts):
  - Given a Node child that sends itself `SIGTERM`
  - When `runSpawnFixture` runs it
  - Then the result reports exit code 143
- [sigint-exit](tests/spawn-fixture-harness.scenario.l1.test.ts):
  - Given a Node child that sends itself `SIGINT`
  - When `runSpawnFixture` runs it
  - Then the result reports exit code 130, the `128 + signal` value from Node's signal-number table
- [spawn-error](tests/spawn-fixture-harness.scenario.l1.test.ts):
  - Given a command path inside an empty temporary directory, where no file exists
  - When `runSpawnFixture` runs it
  - Then the result settles with exit code -1

### Test.Scenario: marker-synchronized closure

- [marker-closure](tests/spawn-fixture-marker.scenario.l1.test.ts):
  - Given a Node child that writes a marker text of lowercase letters to stdout every millisecond and exits with status 130 once its stdout raises an error
  - When `runSpawnFixture` runs it with stdout closure after that marker requested
  - Then the result reports the marker observed, at least the marker's byte count as the stdout bytes observed, and exit code 130

### Test.Property: signal exits

- [unknown-signal-exit](tests/spawn-fixture-harness.property.l1.test.ts): For every string of 1 to 64 characters that names no signal in Node's signal-number table, exit resolution with no exit code and that signal name returns -1

### Audit: process boundary

- real-subprocess: ALWAYS: the fixture spawns a real subprocess with real stdio streams; a fake child process or a stubbed stream fails.
- spawn-fixture-test-values: ALWAYS: the tests of this fixture draw their text values and signal names from generators that `testing/generators/process-lifecycle/spawn-fixture.ts` exports, and run each property through the property harness; a test of this Node that declares its own arbitrary or draws from a generator another Node owns fails.
