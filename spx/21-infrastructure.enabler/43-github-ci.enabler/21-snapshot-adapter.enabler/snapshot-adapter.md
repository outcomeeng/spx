# Snapshot Adapter

PROVIDES a GitHub Snapshot backend that binds the agent-run journal's `JournalBackend` port as its Snapshot kind, publishing a run's rendered projection to a PR comment, an Actions artifact, or an Actions cache entry
SO THAT agentic verification runs executing in GitHub Actions
CAN surface each run's latest event-journal projection on a GitHub-native surface without the journal library performing network or filesystem I/O

## Assertions

### Scenarios

- Given a rendered run projection and a configured GitHub surface — a PR comment, an Actions artifact, or an Actions cache entry — when the Snapshot adapter writes, then the projection is published to that surface ([test](tests/surface-write.scenario.l1.test.ts))

### Properties

- A Snapshot write persists a rendered projection of the run, never an appended event history ([test](tests/snapshot-projection.property.l1.test.ts))

### Compliance

- ALWAYS: the adapter declares its kind as Snapshot and binds the journal's `JournalBackend` port without widening or altering the `append`/`read`/cursor/`render` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
