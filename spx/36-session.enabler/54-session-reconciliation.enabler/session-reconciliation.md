# Session Reconciliation

PROVIDES reconciliation of a session's recorded references — the `git_ref` branch and the `specs` and `files` entries declared by [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md) — against current repository state, resolving each reference to exactly one verdict of confirmed, discrepancy, or unverifiable
SO THAT the session-cli enabler and the agent orchestration tools that resume handoffs
CAN learn which of a session's recorded references still hold before acting on it, without reimplementing reference resolution, restating the recorded field set, or interpreting a git exit status themselves

## Assertions

### Mappings

- Each recorded `git_ref` state maps to a verdict: an exact `origin` remote-tracking branch maps to confirmed, a ref absent from `origin` maps to discrepancy, and a ref whose lookup git cannot answer maps to unverifiable ([test](tests/session-reconciliation.mapping.l1.test.ts))
- Each recorded `specs` or `files` entry state maps to a verdict: a path readable as a file maps to confirmed, a path that is absent or resolves to a directory maps to discrepancy, and a path whose read fails for any other reason maps to unverifiable ([test](tests/session-reconciliation.mapping.l1.test.ts))

### Properties

- For every session record, the emitted verdict count equals the count of recorded references the session carries, so no recorded reference goes unreported and none is reported twice ([test](tests/session-reconciliation.property.l1.test.ts))
- For every session record, reconciliation leaves the session store and the repository byte-identical — reconciliation reports state and never repairs it ([test](tests/session-reconciliation.property.l1.test.ts))

### Compliance

- ALWAYS: an unverifiable verdict is distinguishable from a discrepancy verdict in the emitted result, so a caller tells a reference that could not be evaluated from one that was evaluated and contradicted ([test](tests/session-reconciliation.compliance.l1.test.ts))
- ALWAYS: reconciliation obtains product roots, session scopes, and session records through the state module's injected-dependency API and the session-store primitives rather than reading git plumbing or composing `.spx/` paths itself per [`spx/17-state.adr.md`](../../17-state.adr.md) ([audit])
