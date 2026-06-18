# Agent Test Output Architecture

Agent test output implements the `agent` runner environment from `spx/41-testing.enabler/11-test-runner-environments.pdr.md` by swapping the normal streaming command dependency for a captured-output command dependency. The captured-output dependency invokes the same selected runner command and selected test files as operator mode, writes each child process's stdout and stderr to OS-temp artifact files, returns those paths and any adapter-reported failing test paths in the live dispatch result, and leaves persisted last-run state on the schema governed by `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md`.

## Rationale

The normal `spx test` path stays useful for developers who want the runner's native output, while `spx test --agent` gives non-interactive agent sessions bounded terminal output and raw artifacts from the same single run. Keeping raw output out of `TestRunState` preserves the last-run evidence schema's purpose: fast status reads outcome and freshness metadata, not large runner logs. Returning artifact paths in the live dispatch result gives the CLI boundary enough information to print a compact summary without making command handlers write terminal output.

## Invariants

- Agent mode and streaming mode dispatch the same discovered test files through the same testing registry.
- Agent mode changes only runner I/O handling and terminal formatting; runner selection, runner command construction, test selection, exit-code aggregation, and last-run evidence recording remain identical.

## Verification

### Testing

- ALWAYS: captured runner results carry stdout and stderr artifact paths in the live dispatch result ([compliance])
- ALWAYS: the agent summary reports aggregate status and failed runner details without listing passing test paths individually ([compliance])
- ALWAYS: captured runner execution writes stdout and stderr to files, sets `CI=1`, keeps the child working directory at the product directory, and preserves the selected runner command and arguments ([compliance])
- NEVER: captured runner execution pipes child stdout or stderr to the invoking terminal stream ([compliance])

### Audit

- ALWAYS: command handlers return run data and do not write process stdout/stderr; the CLI descriptor owns terminal rendering per `spx/14-cli-composition.adr.md` ([audit])
- ALWAYS: captured runner dependencies accept injected process and environment boundaries, so tests exercise behavior without replacing modules ([audit])
- ALWAYS: runner-specific command resolution and failure-output parsing remain outside agent output handling ([audit])
- NEVER: use framework mocks for captured runner execution, artifact writing, or terminal summary formatting; inject controlled implementations through explicit dependency parameters instead ([audit])
- NEVER: persist raw runner stdout or stderr inside `TestRunState`; last-run evidence remains the state schema governed by `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md` ([audit])
