# Snapshot Store Persistence

The snapshot store is a `src/lib/snapshot-store/` module that persists and reads whole-document snapshots per addressed run over the record-store run-file mechanics of `src/lib/state-store/`: a write reserves a fresh run file within a caller-resolved `.spx/` scope and records the document as one immutable JSONL record; a read parses a run file back to its document; and enumeration lists a scope's snapshot run files deterministically so multiple snapshots are retained under one scope and the latest is resolvable. Every filesystem access flows through an injected `StateStoreFileSystem`; the module re-derives no git topology or `.spx/` layout and imports nothing from the agent-run journal.

## Rationale

A snapshot is a whole-document projection written once, distinct from the append-only event journal. Reusing the record store's `createJsonlRunFile` (exclusive-create with collision retry) and single-record `writeJsonlRunRecord` (which rejects a second write) yields write-once immutability and per-scope multiplicity directly, so successive runs never clobber one another and any run stays readable and comparable. Taking a caller-resolved scope directory and an injected filesystem keeps `.spx/` derivation in `spx/18-state.enabler/32-scope-addressing.enabler` and git derivation out of the store, mirroring `spx/18-state.enabler/71-appendable-journal-store.enabler/21-appendable-journal-store.adr.md` and `spx/17-state.adr.md`, so the store verifies over a controlled filesystem without a real repository.

Binding the snapshot store to the agent-run journal's `SnapshotBackend` port is rejected: that port renders a projection to an external sink and couples snapshot persistence to the journal library, whereas a local, scope-addressed snapshot is a record-store consumer independent of the journal contract. Re-deriving the `.spx/` scope inside the store is rejected: it duplicates the addressing the state module owns.

## Invariants

- A snapshot document written to a fresh run address reads back byte-identical.
- Each capture reserves a fresh run address through exclusive create and writes its document once; a capture that resolves onto an already-written address rejects and leaves the persisted document unchanged.
- Multiple snapshots persist independently under one scope; enumeration is deterministic and the latest is resolvable.
- A snapshot's run address is a pure function of the resolved scope and run token; the store composes no `.spx/` path from git state itself.

## Verification

### Audit

- ALWAYS: every filesystem read and write flows through an injected `StateStoreFileSystem` parameter — enables `l1` verification over a controlled filesystem without a real repository ([audit])
- ALWAYS: the store resolves run addresses within a caller-supplied `.spx/` scope produced by `spx/18-state.enabler/32-scope-addressing.enabler` and reuses the record-store run-file mechanics of `src/lib/state-store/` for write-once and enumeration ([audit])
- ALWAYS: a snapshot write reserves a fresh run file and records the document once, retaining prior snapshots under the scope rather than overwriting them ([audit])
- NEVER: the module imports `src/lib/agent-run-journal/` or the appendable-journal-store binding, or binds the journal `SnapshotBackend` or `AppendableBackend` port — snapshot persistence is independent of the event journal ([audit])
- NEVER: the module imports `node:fs`, `node:fs/promises`, process globals, or a network client, or re-derives git topology or `.spx/` layout — all I/O is the injected filesystem's, per `spx/17-state.adr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or module interception substitutes for the filesystem — tests inject a controlled `StateStoreFileSystem` and exercise the real store code paths ([audit])
