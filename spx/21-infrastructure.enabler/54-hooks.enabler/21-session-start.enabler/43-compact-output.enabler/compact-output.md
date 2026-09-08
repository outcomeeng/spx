# Compact Output

PROVIDES compact lifecycle stdout for the `session-start` hook event —
emitting the compact-recovery directive of spx's shipped methodology tree for
the payload product's declared methodology line and the invoking coding agent,
only when the invoking runtime's `hooks.sessionStart.compactStdout` policy
enables it and the directive resolves
SO THAT compact handling can deliver current methodology recovery guidance to
runtimes that need it while remaining silent for runtimes whose compact
SessionStart source is delayed or replayed and for products whose shipped
methodology tree names no directive

## Assertions

### Scenarios

- Given the `session-start` hook adapter receives a payload whose lifecycle source is `compact`, when the resolved compact stdout policy is false, then SPX emits no hook stdout ([test](tests/compact-output.scenario.l1.test.ts))
- Given the `session-start` hook adapter receives a payload whose lifecycle source is `compact`, when the resolved compact stdout policy is true and the compact-recovery directive resolved, then SPX emits the resolved directive bytes as hook stdout ([test](tests/compact-output.scenario.l1.test.ts))
- Given `spx hook run session-start` receives a payload whose lifecycle source is `compact`, when the CLI transport resolves a runtime policy whose `hooks.sessionStart.compactStdout` is false, then SPX exits successfully and writes no process stdout ([test](tests/compact-output.scenario.l2.test.ts))
- Given `spx hook run session-start` is invoked outside the payload product and receives a payload whose lifecycle source is `compact`, when the payload product config enables the runtime's `hooks.sessionStart.compactStdout` policy and declares a methodology version spx ships, then SPX resolves the directive against the shipped tree for that product's declared line and the invoking coding agent, writing that resource's bytes to process stdout when the shipped manifest names one and otherwise writing no stdout and naming the absent entry and the resolved tree on stderr ([test](tests/compact-output.scenario.l2.test.ts))
- Given `spx hook run session-start` receives a payload whose lifecycle source is `compact` and the hook environment carries `CLAUDE_ENV_FILE` with no `CODEX_THREAD_ID` or `CLAUDE_SESSION_ID`, when the CLI transport resolves default Claude Code runtime policy and the payload product declares a methodology version spx ships, then SPX resolves the directive against the shipped tree for that line and the Claude Code agent, writing that resource's bytes to process stdout when the shipped manifest names one and otherwise writing no stdout and naming the absent entry and the resolved tree on stderr ([test](tests/compact-output.scenario.l2.test.ts))
- Given `spx hook run session-start` receives a payload whose lifecycle source is `compact` and both Codex and Claude Code runtime markers are present, when the CLI transport resolves compact stdout policy, then SPX applies the Codex compact stdout policy and writes no process stdout ([test](tests/compact-output.scenario.l2.test.ts))

### Mappings

- Every unresolved-directive condition — an undeclared methodology version, a line spx ships no tree for, an absent, unreadable, or invalid manifest, an absent compact-recovery entry, and an uncontained or unreadable directive resource — maps to no compact-source stdout, a stderr diagnostic naming the failed resolution step, and successful hook completion ([test](tests/compact-output.mapping.l1.test.ts))

### Conformance

- Emitted compact-source hook stdout conforms to the manifest-named compact-recovery resource of spx's shipped methodology tree for the declared line and coding agent: the emitted bytes equal that resource's exact bytes ([test](tests/compact-output.conformance.l1.test.ts))

### Compliance

- NEVER: `session-start` emits hook stdout for the `compact` lifecycle source when the resolved compact stdout policy is false ([test](tests/compact-output.compliance.l1.test.ts))
- NEVER: directive resolution reads the shipped methodology tree for an invocation whose compact stdout policy resolved false or whose lifecycle source is not compact ([test](tests/compact-output.compliance.l1.test.ts))
