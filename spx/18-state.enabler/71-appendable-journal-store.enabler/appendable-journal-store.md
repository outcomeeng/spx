# Appendable Journal Store

PROVIDES a local Appendable backend that persists an agent-run journal's events as a JSONL run history over `spx/18-state.enabler/43-record-store.enabler`, binding the `AppendableBackend` port of `spx/15-agent-run-journal.enabler`
SO THAT agentic verdict-mode verification runs — and any journal consumer — on a developer checkout or CI runner
CAN store and replay each run's event history through the journal interface without the journal itself touching the filesystem or `.spx/` layout

## Assertions

### Properties

- A journal bound to this backend assigns strictly increasing, contiguous sequence numbers and replays them identically when a fresh backend reopens the same run history ([test](tests/appendable-journal-store.property.l1.test.ts))
- Across overlapping appends through independent backend instances sharing one run history, every persisted event carries a unique contiguous sequence number, and exactly one append targeting a conflicting sequence rejects with `JOURNAL_ERROR.SEQ_CONSUMED` ([test](tests/appendable-journal-store-concurrency.property.l1.test.ts))

### Compliance

- NEVER: an `append` whose `seq` is already persisted overwrites the stored event — the backend rejects it by throwing `JOURNAL_ERROR.SEQ_CONSUMED` ([test](tests/appendable-journal-store.compliance.l1.test.ts))
- ALWAYS: when execution stops before an event's atomic sequence-record publication, a fresh backend can reuse that sequence; when execution stops after publication, a fresh backend replays the complete event and the next append increments its sequence by one ([test](tests/appendable-journal-store-interruption.compliance.l2.test.ts))
- ALWAYS: when execution stops during aggregate seal materialization, a fresh backend replays every sequence record and a later seal writes the complete ordered aggregate before its seal marker ([test](tests/appendable-journal-store-interruption.compliance.l2.test.ts))
- ALWAYS: after `seal`, `isSealed` reports sealed across a fresh backend over the same run history, and a journal bound to the reopened backend rejects further appends ([test](tests/appendable-journal-store.compliance.l1.test.ts))
- NEVER: `readAll` emits a stored line that is not a conformant journal event — a malformed or non-conformant line is skipped, not returned ([test](tests/appendable-journal-store.compliance.l1.test.ts))
- ALWAYS: the backend declares its kind as Appendable and binds the journal's `AppendableBackend` port without widening the `append` / `readAll` / `seal` / `isSealed` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: the backend accepts a caller-resolved run file path and routes every filesystem access through an injected filesystem interface — re-deriving no git topology or `.spx/` layout — while writes serialize through `spx/18-state.enabler/43-record-store.enabler`, per `spx/17-state.adr.md` ([audit])
