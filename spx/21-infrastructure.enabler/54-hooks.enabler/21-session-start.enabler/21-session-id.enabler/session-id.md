# Session ID

PROVIDES holder identity resolution for the `session-start` hook event — taking
the agent session id and the originating agent from the hook payload
SO THAT session-start dependents
CAN name one holder for the worktree claim without reading the process
environment

## Assertions

### Scenarios

- Given the `session-start` payload carries a session id, when the hook runs, then SPX uses that id as the agent session identity ([test](tests/session-id.scenario.l1.test.ts))
- Given the `session-start` payload carries a session id and the hook environment also carries agent session variables naming different sessions, when the hook runs, then SPX uses the payload session id ([test](tests/session-id.scenario.l1.test.ts))
- Given the `session-start` payload carries no session id, when the hook runs, then SPX resolves no agent session identity and records no worktree claim ([test](tests/session-id.scenario.l1.test.ts))

### Mappings

- Each configured agent session-store root maps a transcript path canonically resolving inside it to that agent's classification, per [`spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md`](../../../../33-harness-environment.enabler/21-harness-environment-descriptor.adr.md); a path that is absent, cannot be canonicalized, resolves outside every configured root, or resolves inside more than one maps to no agent classification and no worktree claim with its source-owned diagnostic ([test](tests/session-id.mapping.l1.test.ts))

### Compliance

- NEVER: `session-start` resolves an agent session identity or an agent classification from the process environment — the payload is the only input for each, per [`spx/21-infrastructure.enabler/54-hooks.enabler/32-hook-interface-architecture.adr.md`](../../32-hook-interface-architecture.adr.md) ([test](tests/session-id.compliance.l1.test.ts))
- NEVER: `session-start` opens the contents of a transcript at the supplied path — containment under a configured store root is the whole classification ([test](tests/session-id.compliance.l1.test.ts))
