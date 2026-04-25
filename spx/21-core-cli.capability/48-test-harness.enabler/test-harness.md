# Test Harness

PROVIDES the withSpecEnv context manager — a scoped temporary-directory lifecycle function that creates, optionally populates with specs or fixture content, and destroys isolated filesystem environments
SO THAT every test that needs an isolated filesystem environment
CAN obtain a temporary directory with guaranteed cleanup through a single call without writing try/finally blocks or afterEach cleanup hooks

## Assertions

### Scenarios

- Given withSpecEnv called with no options, when the callback runs, then the path argument is under os.tmpdir() and its basename contains "spx-test-" ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv called with no options, when the callback completes, then the temporary directory no longer exists on the filesystem ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv called with emptySpecs: true, when the callback runs, then specs/work/doing exists under the provided path and is empty ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv called with emptySpecs: true, when the callback completes, then the entire temporary tree is deleted ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv called with a PRESETS.MINIMAL fixture, when the callback runs, then specs/work/doing contains at least one directory whose name starts with "capability-" ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv called with both fixture and emptySpecs: true, when the callback runs, then fixture takes precedence and capability directories are present ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv called with a fixture config specifying 2 capabilities, when the callback runs, then specs/work/doing contains exactly 2 capability directories ([test](tests/test-harness.scenario.l1.test.ts))
- Given the callback throws an error, when withSpecEnv handles it, then the error propagates to the caller and the temporary directory is deleted ([test](tests/test-harness.scenario.l1.test.ts))
- Given the callback deletes the temporary directory itself, when withSpecEnv runs cleanup, then no error is thrown ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv is called with an async function returning void, when it resolves, then the return value is undefined ([test](tests/test-harness.scenario.l1.test.ts))
- Given withSpecEnv is parameterized with a generic type T, when the callback returns a value of type T, then withSpecEnv resolves to that same value ([test](tests/test-harness.scenario.l1.test.ts))

### Properties

- withSpecEnv deletes the temporary directory for every callback outcome — success, error, or mid-run manual deletion ([test](tests/test-harness.scenario.l1.test.ts))
