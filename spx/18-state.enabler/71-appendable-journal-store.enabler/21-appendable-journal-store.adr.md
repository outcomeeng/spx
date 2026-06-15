# Appendable Journal Store Binding

The agent-run-journal's `AppendableBackend` port is implemented under `src/lib/` as a module that persists one journal stream as a JSONL run history over an injected `StateStoreFileSystem`: each `append` writes one line through the record-store's JSONL serialization, `readAll` parses the run file's lines back into `JournalEvent`s in ascending `seq` order, and `seal` / `isSealed` write and probe a seal-marker file derived from the run path. The caller resolves the run file path from the journal `streamid` within a `.spx/` scope through `spx/18-state.enabler`; the store re-derives no git topology or `.spx/` layout.

## Rationale

The journal contract names no backend, so the local store is one adapter binding the `AppendableBackend` port of `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md`. Reusing the record-store's JSONL serialization keeps one append-per-line format across `.spx/` local execution state; parsing that same format back is the store's only read concern. Taking a resolved run file path and an injected filesystem keeps scope resolution in the consumer and git/`.spx/` derivation in the state module per `spx/17-state.adr.md`, so the store verifies over a controlled filesystem and run path without a real repository.

Deriving seal state from a marker file rather than a sentinel event keeps the persisted history pure CloudEvents — `readAll` parses only events, and seal is a separate fact a fresh store reads back. Rejecting a duplicate `seq` with the journal's own `JOURNAL_ERROR.SEQ_CONSUMED` constant makes the store honor the error contract the journal's compliance test asserts, so every consumer reads one error vocabulary across backends.

Rejected: generating a random run token per stream (the record-store's `createJsonlRunFile`) — a stream's file must be deterministic from its `streamid` so a restart or re-read reopens the same history; and resolving the `.spx/` scope inside the store — that duplicates the git and `.spx/` derivation the state module owns.

## Invariants

- The run file path and seal-marker path are pure functions of their inputs; the same `streamid` and resolved scope yield the same paths.
- `readAll` returns every persisted event exactly once, ordered by ascending `seq`, parsing only well-formed lines.
- An `append` whose `seq` already appears in the history leaves the file unchanged and rejects.

## Verification

### Audit

- ALWAYS: the store implements `AppendableBackend` with `kind` Appendable and never widens or alters the `append` / `readAll` / `seal` / `isSealed` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: every filesystem read and write flows through an injected `StateStoreFileSystem`; the store imports no `node:fs`, process globals, or network client and re-derives no git topology or `.spx/` layout, per `spx/17-state.adr.md` ([audit])
- ALWAYS: writes serialize through the record-store's JSONL serialization so the local store shares one line format with other `.spx/` run histories ([audit])
- ALWAYS: an `append` whose `seq` is already persisted rejects by throwing `JOURNAL_ERROR.SEQ_CONSUMED` — the journal's own error constant — rather than a store-local error ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or module interception substitutes for the filesystem — tests inject a controlled `StateStoreFileSystem` and exercise the real store code paths, per `spx/17-state.adr.md` ([audit])
- NEVER: the store reads authoritative seal state from anywhere but the seal marker, or treats a parse-failed line as an event ([audit])
