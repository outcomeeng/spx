# Hooks

PROVIDES the SPX hook event interface — a `spx hook run <event>` runner
that consumes agent lifecycle payloads, dispatches registered hook events, and
coordinates shared domain services
SO THAT installed agent plugins
CAN delegate lifecycle behavior to SPX without reimplementing it in plugin
scripts or forcing cross-domain hook work through one domain's command surface

## Assertions

### Scenarios

- Given a plugin invokes `spx hook run session-start` and hook stdin cannot be read, when the hook runner handles the event, then SPX records a diagnostic and does not fail the hook invocation ([test](tests/hook-cli.scenario.l1.test.ts))

### Compliance

- ALWAYS: agent lifecycle hook behavior that serves multiple product domains is
  governed under the hooks infrastructure node, not under the first domain that
  consumes the event ([audit])
- ALWAYS: hook event execution is invoked through `spx hook run <event>`, with
  the hook event registry's lowercase hyphenated operand derived from the
  upstream lifecycle event ([test](21-session-start.enabler/tests/session-start.compliance.l2.test.ts))
- ALWAYS: the first required event operand is `session-start`, matching the
  lowercase hyphenated hook-runner naming used by established hook tools
  ([test](21-session-start.enabler/tests/session-start.compliance.l2.test.ts))
- ALWAYS: hook events may coordinate multiple SPX domains in one invocation while
  preserving each domain's ownership of its underlying state and rules ([audit])
- NEVER: expose an agent lifecycle hook as a domain-specific command such as
  `spx worktree session-start` ([audit])
