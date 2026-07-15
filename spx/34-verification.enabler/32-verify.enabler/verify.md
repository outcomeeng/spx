# Verify

PROVIDES typed verification-run lifecycle operations over the verification-context and journal substrate
SO THAT whichever party drives a scoped verification run — an agent, a CI job, a launcher, or spx executing a runner
CAN start one scoped run with a stable run locator, read the exact verification input, record inspected scope and validated findings, finish the run, inspect resumable status, and render the journal projection without constructing journal events directly

## Assertions

### Compliance

- NEVER: a caller hand-formats the journal event envelope for a verification run; verification-run lifecycle operations construct journal events from typed lifecycle inputs ([test](32-evidence-append.enabler/tests/verify-finding.compliance.l1.test.ts), [test](43-terminal-projection.enabler/tests/verify-lifecycle.scenario.l1.test.ts))
- ALWAYS: verification-run lifecycle operations record and render a run whichever party drives it — an agent, a launcher, or spx executing a runner ([audit])
- NEVER: verification-run lifecycle operations launch, configure, or select a verification agent — an agentic verification is judged by an agent the agent harness launches, per `spx/12-agent-harness.pdr.md` ([audit])
