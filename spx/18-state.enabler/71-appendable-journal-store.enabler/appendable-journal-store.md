# Appendable Journal Store

PROVIDES a local Appendable backend that persists an agent-run journal's events as a JSONL run history over `spx/18-state.enabler/43-record-store.enabler`, binding the `AppendableBackend` port of `spx/15-agent-run-journal.enabler`
SO THAT audit and review verdict-mode runs — and any journal consumer — on a developer checkout or CI runner
CAN store and replay each run's event history through the journal interface without the journal itself touching the filesystem or `.spx/` layout

## Assertions

### Properties

- A journal bound to this backend assigns strictly increasing, contiguous sequence numbers and replays them identically when a fresh backend reopens the same run history ([test](tests/appendable-journal-store.property.l1.test.ts))

### Compliance

- NEVER: an `append` whose `seq` is already persisted overwrites the stored event — the backend rejects it by throwing `JOURNAL_ERROR.SEQ_CONSUMED` ([test](tests/appendable-journal-store.compliance.l1.test.ts))
- ALWAYS: after `seal`, `isSealed` reports sealed across a fresh backend over the same run history, and a journal bound to the reopened backend rejects further appends ([test](tests/appendable-journal-store.compliance.l1.test.ts))
- ALWAYS: the backend declares its kind as Appendable and binds the journal's `AppendableBackend` port without widening the `append` / `readAll` / `seal` / `isSealed` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: every filesystem access flows through an injected filesystem interface and the run path resolves through `spx/18-state.enabler/43-record-store.enabler`; the backend re-derives no git topology or `.spx/` layout, per `spx/17-state.adr.md` ([audit])
