# Verify

PROVIDES typed changeset verification-run lifecycle operations over the verification-context and journal substrate
SO THAT agents, CI jobs, and launchers that run review, audit, and other scoped verification workflows
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
- NEVER: verification-run lifecycle operations launch, configure, or select the verifier agent; they record and render the run that the caller drives ([audit])
