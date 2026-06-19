# Agent Test Output

PROVIDES the `agent` runner environment for `spx test` runs, with compact agent-facing output and raw runner stdout and stderr captured as artifacts
SO THAT agents and developers running spec-tree tests through non-interactive terminals
CAN detect failures from one run without streaming passing-test noise into the transcript or losing raw diagnostics

## Assertions

### Scenarios

- Given an agent-output test run with a captured failing runner, when the agent summary is formatted, then the terminal output includes the aggregate exit code, failing runner identity, failing test paths, the last-run state path, and stdout/stderr artifact paths ([test](tests/agent-test-output.scenario.l1.test.ts))
- Given an agent-output test run with a captured passing runner, when the agent summary is formatted, then the terminal output includes counts and artifact paths without listing every passing test path ([test](tests/agent-test-output.scenario.l1.test.ts))
- Given an agent-output test run with selected runner groups that produce no runner reports, when the agent summary is formatted, then the terminal output reports failed status with the aggregate exit code, runner identity, and requested test paths ([test](tests/agent-test-output.scenario.l1.test.ts))
- Given an agent-output test run with unmatched test files, when the agent summary is formatted, then the terminal output lists unmatched paths under the unmatched label ([test](tests/agent-test-output.scenario.l1.test.ts))

### Compliance

- ALWAYS: agent-output runner execution writes child stdout and stderr to files and returns those file paths with the runner result ([test](tests/agent-test-output.compliance.l1.test.ts))
- ALWAYS: agent-output runner execution preserves the supplied child environment while preserving the product directory as the child working directory ([test](tests/agent-test-output.compliance.l1.test.ts))
- ALWAYS: agent-output runner execution preserves the selected runner command and arguments while changing only output capture ([test](tests/agent-test-output.compliance.l1.test.ts))
- ALWAYS: agent-output runner execution creates artifact directories only when a runner command executes ([test](tests/agent-test-output.compliance.l1.test.ts))
- ALWAYS: agent-output runner execution fails without artifact paths when artifact writing fails ([test](tests/agent-test-output.compliance.l1.test.ts))
- NEVER: agent-output runner execution writes child stdout or stderr directly to the invoking terminal stream ([test](tests/agent-test-output.compliance.l1.test.ts))
