# Event-Sourced Agent Run Journal

Every agentic verification run executed by a coding-agent skill is one named, append-only event journal, and that journal is the sole source of truth for the run. The PR comment, markdown report, findings JSON, and check summary are projections rendered from the journal's event history, never authoritative state. Backends differ only in where the journal and its projections are stored; the contract is invariant — events append under a monotonic sequence, consumers resume from a cursor, and projections render by replaying the event history.

## Rationale

A contract phrased in facts and derivations — `append`, `read`, cursor, `render` — survives backend substitution, because no backend's storage shape appears in it. Separating the canonical event history from its projections keeps a mutable, size-bounded display surface from contaminating the run's source of truth: the journal accumulates facts, and a projection re-renders from them on demand and serves as the run's final output.

## Invariants

For any journal `J`:

- **Monotonic contiguity.** Appended events carry strictly increasing, contiguous sequence numbers: for adjacent appends `e_i`, `e_{i+1}`, `seq(e_{i+1}) = seq(e_i) + 1`.
- **Append-only.** A persisted event is neither mutated nor removed; a correction exists only as a later event referencing the original.
- **Projection purity.** `render` is a pure function of an event prefix: `render(J[0..n])` is identical on every backend and on every replay.
- **Replay equivalence.** `read(J, from=c)` equals `read(J, from=0)` with every event of `seq < c` removed, for any cursor `c`.
- **Terminal seal.** After `seal(J)`, no `append(J, …)` has a successful outcome; the sealed sequence is final.
- **Cursor stability.** An event's `seq` identifies it identically across backends, restarts, and re-run attempts.

## Verification

### Testing

- ALWAYS: An appended event serializes to a record bearing the required CloudEvents attributes (`id`, `source`, `type`, `specversion`, `time`) and the stream extensions (`streamid`, `seq`, `runid`, `attempt`). ([conformance])
- ALWAYS: For any sequence of appends to a journal, the resulting sequence numbers are strictly increasing and contiguous from the journal's base. ([property])
- ALWAYS: For any cursor `c`, `read(from=c)` returns exactly `read(from=0)` with every event of `seq < c` removed. ([property])
- ALWAYS: `render` over a given event prefix yields byte-identical output across every backend and across repeated calls. ([property])
- ALWAYS: An event's sequence number identifies it identically across backends, restarts, and re-run attempts. ([property])
- NEVER: A write targeting an already-consumed sequence number overwrites the persisted event; the journal rejects it. ([compliance])
- NEVER: An append returns success on a sealed journal. ([compliance])
- NEVER: A persisted event is mutated or removed; a correction appends a new event referencing the original. ([compliance])

### Eval

- ALWAYS: The executing agent records durable domain facts (finding reported, tool completed, run completed) to the journal and routes ephemeral output (message and token deltas) to a projection channel. ([eval])
- ALWAYS: The executing agent expresses a correction to a prior finding as a new event referencing the original, rather than restating the original as though unchanged. ([eval])
- NEVER: The executing agent reads authoritative run state from the PR comment body rather than from the journal. ([eval])

### Audit

- ALWAYS: Every backend is either an Appendable journal store or a Snapshot projection sink, and neither kind alters the `append` / `read` / cursor / `render` contract. ([audit])
- NEVER: A governed skill treats a projection — PR comment, rendered report, or cache blob — as the source of truth for run state. ([audit])
