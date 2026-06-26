# Hooks

PROVIDES the SPX hook event interface — a `spx hook run <event>` runner
that consumes agent lifecycle payloads, writes hook-runtime exports, emits
hook-specific context, and coordinates shared domain services
SO THAT installed agent plugins
CAN delegate lifecycle behavior to SPX without reimplementing it in plugin
scripts or forcing cross-domain hook work through one domain's command surface

## Assertions

### Scenarios

- Given the `session-start` hook adapter receives a hook payload and env-file path, when the event runs with enough identity and worktree information to claim the worktree, then SPX appends the session and project exports and records one worktree occupancy claim ([test](tests/session-start.scenario.l1.test.ts))
- Given the `session-start` hook adapter receives a payload whose lifecycle source is `compact`, when the event runs, then SPX emits a foundation re-anchor directive on hook stdout instructing re-invocation of `/understand` then `/contextualize` before resuming spec-governed work ([test](tests/session-start.scenario.l1.test.ts), [test](tests/hook-cli.scenario.l2.test.ts))
- Given a plugin invokes `spx hook run session-start` and hook stdin cannot be read, when the hook runner handles the event, then SPX records a diagnostic and does not fail the hook invocation ([test](tests/hook-cli.scenario.l1.test.ts))

### Compliance

- ALWAYS: agent lifecycle hook behavior that serves multiple product domains is
  governed under the hooks infrastructure node, not under the first domain that
  consumes the event ([audit])
- ALWAYS: hook event execution is invoked through `spx hook run <event>`, with
  the hook event registry's lowercase hyphenated operand derived from the
  upstream lifecycle event ([audit])
- ALWAYS: the first required event operand is `session-start`, matching the
  lowercase hyphenated hook-runner naming used by established hook tools
  ([test](tests/hook-cli.compliance.l2.test.ts))
- ALWAYS: hook events may coordinate multiple SPX domains in one invocation while
  preserving each domain's ownership of its underlying state and rules ([audit])
- NEVER: expose an agent lifecycle hook as a domain-specific command such as
  `spx worktree session-start` ([audit])
- NEVER: `session-start` emits the foundation re-anchor directive on hook stdout
  for a lifecycle source other than `compact`
  ([test](tests/session-start.compliance.l1.test.ts))
