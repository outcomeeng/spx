# Agent Run Journal

PROVIDES an append-only event-store interface — append events under a monotonic cursor, read from a cursor, render projections by replay, and seal a run — specified independently of any storage backend, so an adapter binds the interface to a concrete store at composition time
SO THAT the typed verification-run lifecycle, journal substrate, and storage adapters under `spx/34-verification.enabler`
CAN persist each run's truth once as an event history and render it into PR comments, reports, and check summaries identically whichever backend a run uses

## Assertions

### Properties

- Appending events to a journal yields strictly increasing, contiguous sequence numbers from the journal's base ([test](tests/agent-run-journal.property.l1.test.ts))
- Reading from a cursor returns exactly the events at a sequence at or above that cursor ([test](tests/agent-run-journal.property.l1.test.ts))
- Rendering a projection over an event prefix is identical across every adapter and across repeated calls ([test](tests/agent-run-journal.property.l1.test.ts))
- An event's sequence number identifies it identically across backends, restarts, and re-run attempts ([test](tests/agent-run-journal.property.l1.test.ts))
- After every append, the prior history is an unchanged prefix of the new history and the appended event is its only addition — a persisted event is never mutated or removed ([test](tests/agent-run-journal-append-only.property.l1.test.ts))
- Across overlapping appends through independent journal instances bound to one shared run history, no two persisted events carry the same sequence number, the persisted sequences are contiguous from the journal's base, and every append returns the event it persisted without surfacing `JOURNAL_ERROR.SEQ_CONSUMED` ([test](tests/agent-run-journal-concurrency.property.l1.test.ts))

### Conformance

- Each appended event conforms to the CloudEvents attribute set and the journal stream extensions ([test](tests/agent-run-journal.conformance.l1.test.ts))

### Compliance

- ALWAYS: a correction to a persisted event is a later appended event referencing the original, never a mutation of it ([audit])
- NEVER: an append to a sealed journal succeeds ([test](tests/agent-run-journal.compliance.l1.test.ts))
- NEVER: a write to an already-consumed sequence number overwrites the persisted event ([test](tests/agent-run-journal.compliance.l1.test.ts))
- NEVER: an append that observes `JOURNAL_ERROR.SEQ_CONSUMED` retries at a sequence the refreshed history already holds; a collision observed after the journal was sealed fails with `JOURNAL_ERROR.SEALED`, and while the journal is unsealed a collision whose refreshed history has not grown since the colliding attempt fails with `JOURNAL_ERROR.SEQ_CONSUMED` ([test](tests/agent-run-journal-concurrency.compliance.l1.test.ts))
- ALWAYS: the `runtime` config descriptor resolves an absent `eventNamespace` to its declared default and rejects a blank or non-string override ([test](tests/runtime-config.compliance.l1.test.ts))
- ALWAYS: journal run and verify event types compose their CloudEvents `type` from the single `runtime` descriptor `eventNamespace` default declaration rather than each restating the namespace root ([audit])
