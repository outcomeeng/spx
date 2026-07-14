# Verify

PROVIDES typed changeset verification-run lifecycle operations over the verification-context and journal substrate
SO THAT whichever party drives a scoped verification run — an agent, a CI job, a launcher, or spx executing a runner
CAN start one scoped run with a stable run locator, read the exact verification input, record inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Assertions

### Mappings

- Verification-run lifecycle operations map to run behavior: start creates context and journal, input returns recorded input, scope evidence records the inspected scope from an evidence payload with an idempotency key, finding evidence records a validated finding from an evidence payload with an idempotency key, finish records terminal completion with a terminal status and seals, status reports resumable state, and render projects the journal ([test](21-run-context.enabler/tests/verify-start.scenario.l1.test.ts), [test](21-run-context.enabler/tests/verify-input.scenario.l1.test.ts), [test](32-evidence-append.enabler/tests/verify-idempotency.compliance.l1.test.ts), [test](32-evidence-append.enabler/tests/verify-finding.compliance.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-lifecycle.scenario.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-status.compliance.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-render.scenario.l1.test.ts))

### Compliance

- NEVER: a caller hand-formats the journal event envelope for a verification run; verification-run lifecycle operations construct journal events from typed lifecycle inputs ([test](32-evidence-append.enabler/tests/verify-finding.compliance.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-lifecycle.scenario.l1.test.ts))
- ALWAYS: `start` reports a stable run locator containing the run token, verification type, scope type, scope identity, backend identity, storage namespace, and journal run path or backend target ([test](21-run-context.enabler/tests/verify-start.compliance.l1.test.ts))
- ALWAYS: existing-run lifecycle operations require a run token and reject ambiguous type/scope-only selection ([test](21-run-context.enabler/tests/verify-input.compliance.l1.test.ts))
- ALWAYS: existing-run lifecycle operations reject a selector that conflicts with a present recorded-input sidecar, including repeated terminal projections ([test](21-run-context.enabler/tests/verify-input.compliance.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-lifecycle.compliance.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-status.compliance.l1.test.ts))
- ALWAYS: existing-run lookup failures report the run token, verification type, scope type, scope identity, backend identity, storage namespace, searched target, and selector inputs needed to address the run ([test](21-run-context.enabler/tests/verify-input.compliance.l1.test.ts))
- NEVER: existing-run lifecycle operations read a fresh input value after start records the run input ([test](21-run-context.enabler/tests/verify-input.compliance.l1.test.ts))
- ALWAYS: verification-run lifecycle operations record and render a run whichever party drives it — an agent, a launcher, or spx executing a runner ([audit])
- ALWAYS: `start` records the run's drive mode — caller-driven or spx-driven — so later lifecycle operations distinguish a run a caller appends to from a run spx opens, streams, and seals within one invocation ([test](21-run-context.enabler/tests/verify-drive-mode.compliance.l1.test.ts))
- ALWAYS: status and render next actions filter by the recorded drive mode, so an unsealed spx-driven run advertises no caller evidence-append action such as `scope add` or `finding add` ([test](43-terminal-projection.enabler/tests/verify-drive-mode.compliance.l1.test.ts))
- NEVER: verification-run lifecycle operations launch, configure, or select a verification agent — an agentic verification is judged by an agent the agent harness launches, per `spx/12-agent-harness.pdr.md` ([audit])
