---
id: 01a2049f-5040-76b7-b31f-0aa900277898
---

# Validation Subprocess Harness

PROVIDES recording validation subprocess collaborators: a child process with pass-through stdout and stderr, kill and close controls, and a `ProcessRunner` that records commands, arguments, spawn options, and spawned children
SO THAT process-lifecycle and validation subprocess tests
CAN verify managed-subprocess wiring, spawn-option propagation, stream forwarding, and lifecycle-runner injection through one shared governed harness

## Assertions

### Test.Scenario: recording validation child

- [close-successfully](tests/validation-subprocess-harness.scenario.l1.test.ts):
  - Given a recording validation child with one `close` listener
  - When `closeSuccessfully` runs
  - Then the listener receives exit code 0 exactly once
- [pass-through-streams](tests/validation-subprocess-harness.scenario.l1.test.ts):
  - Given a recording validation child, a stdout text, and a stderr text, each of lowercase letters
  - When each text is written to its stream of the child and each stream is read
  - Then stdout yields the stdout text and stderr yields the stderr text

### Test.Property: spawn recording

- [spawn-calls-recorded](tests/validation-subprocess-harness.property.l1.test.ts): For every sequence of spawn calls, the empty sequence included, each with any command string, any list of argument strings, and options that carry any working-directory string, a recording spawn-options runner appends each command, argument list, options object, and returned child in call order, and `spawnOptions` returns the options of the latest call, or `undefined` before the first

### Audit: harness ownership

- one-harness-owner: ALWAYS: `testing/harnesses/validation/subprocess.ts` is the one harness module of validation subprocess collaborators, shared by the process-lifecycle and the validation tests; a second module that declares such a collaborator fails.
- subprocess-test-values: ALWAYS: the tests of this harness draw their text values and spawn calls from generators that `testing/generators/validation/subprocess.ts` exports, and run each property through the property harness; a test of this Node that declares its own arbitrary or draws from a generator another Node owns fails.
