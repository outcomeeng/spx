# Snapshot Store

PROVIDES a local snapshot store — writing and reading back an immutable snapshot document per addressed run, retaining multiple snapshots per resolved `.spx/` scope — over an injected `StateStoreFileSystem`, per [`spx/17-state.adr.md`](../../17-state.adr.md)
SO THAT consumers persisting a whole projected payload addressed by worktree or branch, such as a test verification run's per-case snapshot,
CAN retain, read back, enumerate, and compare successive runs without appending an event history, re-deriving `.spx/` layout, or clobbering another run's snapshot

## Assertions

### Scenarios

- Given a resolved `.spx/` scope, when a snapshot document is written to a fresh run address and read back by that address, then the read returns the exact document written ([test](tests/snapshot-store.scenario.l1.test.ts))
- Given a scope holding no snapshot, when its snapshots are enumerated and its latest is read, then the enumeration is empty and the latest resolves to no document rather than an error ([test](tests/snapshot-store.scenario.l1.test.ts))
- Given two snapshots written under one resolved scope, when the scope's snapshots are read, then both are retained and independently readable, the latest is resolvable, and neither run clobbers the other ([test](tests/snapshot-store.scenario.l1.test.ts))

### Compliance

- ALWAYS: each capture reserves a fresh run address and writes its document once, so no capture overwrites another — a capture that resolves onto an already-written address is rejected, leaving the persisted document unchanged ([test](tests/snapshot-store.compliance.l1.test.ts))
- ALWAYS: every filesystem read and write flows through an injected `StateStoreFileSystem`, and a run address resolves within a `.spx/` scope produced by `spx/18-state.enabler/32-scope-addressing.enabler`; the store re-derives no git topology or `.spx/` layout ([audit])
- NEVER: a capture addresses a `(scope, domain)` pair whose run-file directory another node owns — `spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md` reserves `.spx/worktree/test/runs/` for testing last-run evidence, and enumeration cannot tell a foreign run record from a snapshot, so a test-verification capture takes a domain distinct from `test` ([audit])
- NEVER: the store imports or binds `spx/15-agent-run-journal.enabler` or `spx/18-state.enabler/71-appendable-journal-store.enabler` — snapshot persistence is independent of the event journal ([audit])
