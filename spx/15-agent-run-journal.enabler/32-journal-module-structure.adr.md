# Agent Run Journal Module Structure

The agent run journal is a backend-agnostic event-store library under `src/lib/agent-run-journal/`: the CloudEvents event model, the journal interface (`append`, `read` from a cursor, `render`, `seal`), and the replay and projection logic compose over an injected storage-backend port, and the concrete Appendable and Snapshot adapters bind that port from their own modules — the local Appendable adapter over `src/lib/state-store/`, the GitHub adapter in its CI-integration module. The library performs no filesystem, process, or network I/O; every backend reaches the journal only through the port.

## Rationale

A shared event-store library co-located with the other cross-consumer primitives under `src/lib/` keeps the journal contract in one place for audit, review, and any later consumer, while the storage-backend port keeps the contract free of any backend's shape — the separation `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md` decides at the spec layer, realized in the type system. The port is the single seam: the journal computes sequence assignment, cursor reads, projection rendering, and seal state as pure functions over an injected `JournalBackend`, so the local and GitHub adapters supply storage without the journal importing `node:fs`, process globals, or a network client. Each event is a CloudEvents record carrying the journal's stream extensions, so the wire format stays inspectable with standard tooling.

Rejected: placing the journal under `src/domains/` (it is a shared library consumed by multiple domains, not one command domain's pure computation, per `spx/14-cli-composition.adr.md`); folding the local adapter into the library (that couples the backend-agnostic contract to `state-store`, the coupling the port exists to prevent); and baking a single concrete backend into the journal (the contract names no backend, so the backend is injected, never chosen at the library boundary).

## Invariants

- The journal computes `append`, `read`, `render`, and `seal` as pure functions of their inputs and the injected `JournalBackend`; the same inputs and backend state yield the same result.
- Every appended event carries the CloudEvents attributes (`id`, `source`, `type`, `specversion`, `time`) and the stream extensions (`streamid`, `seq`, `runid`, `attempt`), with `seq` assigned by the journal at append time.
- A `JournalBackend` is exactly one kind — an Appendable store or a Snapshot sink — and binding it never widens or alters the `append` / `read` / cursor / `render` contract.

## Verification

### Audit

- ALWAYS: the journal interface accepts its storage through an injected `JournalBackend` port parameter — enables `l1` verification against a real in-memory adapter ([audit])
- ALWAYS: each adapter declares whether it is Appendable or Snapshot and binds the port without widening or altering the journal contract ([audit])
- NEVER: any module under `src/lib/agent-run-journal/` imports `node:fs`, `node:fs/promises`, process globals, or a network client — all I/O is the adapter's, behind the port ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module interception substitutes for the backend — tests inject a real in-memory `JournalBackend` and exercise the real journal code paths ([audit])
