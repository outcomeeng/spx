# Execute

PROVIDES spx-driven verification execution — spx drives a deterministic runner selected by verification type over a caller's scope and records the run it drives through the verify lifecycle
SO THAT the `spx verification <type> run` command surface and CI jobs
CAN have spx run a deterministic verification and stream its scope and finding evidence into the run journal, without the caller driving the runner or constructing journal events

## Assertions

### Scenarios

- Given a verification type and a scope, when spx executes the run, then spx drives the type's deterministic runner over the scope and records the run through the verify lifecycle, reporting the run locator the recorder returns ([test](tests/execute.scenario.l1.test.ts))
- Given a runner that reports a passing unit and a failing unit, when spx executes the run, then the passing unit records a scope event and the failing unit records a finding, and the run finishes with the terminal status the recorder derives ([test](tests/execute.scenario.l1.test.ts))

### Compliance

- ALWAYS: spx records an executed run's scope, finding, and terminal evidence through the verify lifecycle operations of `spx/34-verification.enabler/32-verify.enabler`, never by constructing journal events directly ([test](tests/execute.compliance.l1.test.ts))
- ALWAYS: an executed run's next actions filter by the run's drive mode recorded at `start`, so an unsealed spx-driven run advertises no caller evidence-append action such as `scope add` or `finding add` ([test](tests/execute.compliance.l1.test.ts))
- ALWAYS: spx reaches a verification type's runner through `src/test/registry.ts`, so the executor names no language, per `spx/19-language-registration.adr.md` ([test](tests/execute.compliance.l1.test.ts))
- NEVER: spx execution drives a verification agent — spx drives a deterministic runner, and an agentic verification is judged by an agent the agent harness launches, per `spx/12-agent-harness.pdr.md` ([audit])
