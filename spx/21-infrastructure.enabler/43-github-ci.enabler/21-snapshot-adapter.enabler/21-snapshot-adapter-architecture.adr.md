# Snapshot Adapter Architecture

The GitHub Snapshot adapter is a `src/lib/github-snapshot-sink/` module that binds the agent-run journal's `JournalBackend` port as its Snapshot kind: it accepts a rendered projection and a resolved GitHub surface target and publishes the projection through an injected GitHub client, performing every network, `gh`, and Actions-runtime access behind that injected interface. A mutable surface — a pull-request comment — is upserted in place; an immutable surface — an Actions artifact or an Actions cache entry — is addressed per run so the latest projection is resolvable without overwriting a written entry. The production pull-request client may use `gh api` as its transport mechanism, but that mechanism is GitHub CI backend infrastructure rather than journal command or CLI-interface behavior.

## Rationale

The journal contract names no backend, so the Snapshot sink is one adapter binding the `SnapshotBackend` member of the `JournalBackend` port, symmetric to the local Appendable store of `spx/18-state.enabler/71-appendable-journal-store.enabler`. Concentrating GitHub API and Actions-runtime access behind an injected client keeps the sink's dispatch and surface-selection logic verifiable over a controlled client without a network — the same boundary discipline by which the Appendable store routes filesystem access through an injected `StateStoreFileSystem` per `spx/17-state.adr.md` — so the real GitHub client binds only at the outermost edge. The same pull-request upsert mechanics serve any consumer that needs a GitHub-native rendered projection, including the journal channel and the result-delivery GitHub backend, without either consumer importing GitHub transport policy.

A pull-request comment is mutable, so presenting the latest projection is an in-place upsert of one bot comment. An Actions artifact name and an Actions cache key are immutable once written, so the same projection cannot be overwritten in place; the sink addresses each run's projection under a run-scoped name or key and a reader resolves the latest. This split is why the surface strategy is the adapter's decision and not the journal's: the journal renders a projection string, while how that string reaches a surface that may forbid mutation is the sink's concern.

Rejected: writing GitHub access inside the journal library (`spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` keeps the journal free of network and filesystem I/O); a single overwrite strategy across every surface (an immutable cache key or artifact name cannot be overwritten); and mocking the GitHub client in tests (it verifies a fiction rather than the real dispatch paths).

## Invariants

- The sink declares `kind` Snapshot and exposes only the journal's `SnapshotBackend.write` contract; binding it never widens or alters the journal's `append` / `read` / cursor / `render` contract.
- For the same rendered projection and surface target, the surface a reader resolves holds exactly that projection — an in-place upsert on a mutable surface, a run-scoped entry on an immutable one.
- Constructing the sink reads no ambient environment; every network and Actions-runtime access passes through the injected client.

## Verification

### Testing

- ALWAYS: a mutable surface (a pull-request comment) is presented by an in-place upsert, and an immutable surface (an Actions artifact or Actions cache entry) is addressed per run so the latest projection is resolvable, never overwritten ([property])

### Audit

- ALWAYS: the sink is a `src/lib/` module binding the journal's `SnapshotBackend` — the Snapshot kind of `JournalBackend` — and exposing the `write` contract without widening or altering the journal contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: every GitHub API, `gh`, and Actions-runtime access routes through a client interface accepted as an injected parameter, so the sink's dispatch and surface-selection logic verifies over a controlled client at `l1` and the real client binds only at the outermost edge, mirroring `spx/17-state.adr.md` ([audit])
- ALWAYS: the production pull-request comment client and any result-delivery GitHub backend reuse this GitHub CI adapter boundary rather than constructing GitHub API mechanics in journal command or CLI-interface modules ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module interception substitutes for the GitHub client — tests inject a controlled client implementing the same interface and exercise the real sink code paths ([audit])
