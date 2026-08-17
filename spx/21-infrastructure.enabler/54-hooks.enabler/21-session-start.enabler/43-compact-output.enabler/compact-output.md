# Compact Output

PROVIDES compact lifecycle stdout policy for the `session-start` hook event —
emitting model-visible compact recovery context only when the invoking agent's
`hooks.sessionStart.compactStdout` policy enables it
SO THAT compact handling can remain active for agents that need it while
remaining silent for agents whose compact SessionStart source is delayed or
replayed

## Assertions

### Scenarios

- Given the `session-start` hook adapter receives a payload whose lifecycle source is `compact`, when the resolved compact stdout policy is false, then SPX emits no hook stdout ([test](tests/compact-output.scenario.l1.test.ts))
- Given the `session-start` hook adapter receives a payload whose lifecycle source is `compact`, when the resolved compact stdout policy is true, then SPX emits the compact foundation directive as hook stdout ([test](tests/compact-output.scenario.l1.test.ts))
- Given `spx hook run session-start` receives a payload whose lifecycle source is `compact`, when the CLI transport resolves a policy whose `hooks.sessionStart.compactStdout` is false for the payload-classified agent, then SPX exits successfully and writes no process stdout ([test](tests/compact-output.scenario.l2.test.ts))
- Given `spx hook run session-start` is invoked outside the payload product and receives a payload whose lifecycle source is `compact`, when the payload product config enables the classified agent's `hooks.sessionStart.compactStdout` policy, then SPX resolves compact stdout policy from the payload product and writes the compact foundation directive to process stdout ([test](tests/compact-output.scenario.l2.test.ts))
- Given `spx hook run session-start` receives a payload whose lifecycle source is `compact` and whose transcript path resolves inside the Claude Code session-store root, when the CLI transport resolves default Claude Code policy, then SPX writes the compact foundation directive to process stdout ([test](tests/compact-output.scenario.l2.test.ts))
- Given `spx hook run session-start` receives a payload whose transcript path resolves inside the Codex session-store root while the hook environment also carries Claude Code session variables, when the CLI transport resolves compact stdout policy, then SPX applies the Codex compact stdout policy and writes no process stdout ([test](tests/compact-output.scenario.l2.test.ts))

### Compliance

- NEVER: `session-start` emits hook stdout for the `compact` lifecycle source when the resolved compact stdout policy is false ([test](tests/compact-output.compliance.l1.test.ts))
- NEVER: compact stdout policy selects its agent from the process environment — the classified agent comes from the payload, per [`spx/21-infrastructure.enabler/54-hooks.enabler/21-hook-event-runner.pdr.md`](../../21-hook-event-runner.pdr.md) ([test](tests/compact-output.compliance.l1.test.ts))
