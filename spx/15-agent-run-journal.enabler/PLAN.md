# Plan: Agent Run Journal downstream work

The event-store interface lives at `src/lib/agent-run-journal/` — the contract in
[`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md), the module
structure in [`32-journal-module-structure.adr.md`](32-journal-module-structure.adr.md).
It names no backend; realizing it proceeds in sequence, each step its own change with
the spec authored against a working adapter:

1. **Adapters** — bind the journal's `AppendableBackend` / `SnapshotBackend` ports from
   their own nodes; each adapter node declares the one kind it binds and tests it.
   - **Local Appendable adapter** — a child enabler of `spx/18-state.enabler` (index
     above `43-record-store.enabler`, which it consumes), implemented under `src/lib/`.
     Maps a journal stream onto the state-store's JSONL run mechanics:
     - a journal stream (`streamid`) ↔ one `.spx/` run file (a deterministic scope path,
       or `createJsonlRunFile`);
     - `append(event)` ↔ `appendJsonlRecord` of the event as one JSONL line;
     - `readAll()` ↔ read and parse every JSONL line into `JournalEvent`s ordered by `seq`;
     - `seal()` / `isSealed()` ↔ a seal marker (a sentinel record or a sibling marker file).
       The adapter enforces `seq` exclusivity by rejecting an append whose `seq` is already
       present, throwing `JOURNAL_ERROR.SEQ_CONSUMED` — this settles the implicit-error-contract
       follow-up in [`ISSUES.md`](ISSUES.md) by having the first real adapter honor the
       journal's error constant. Revisit the append history-read (O(n)) follow-up here, where
       a real backend's `readAll` cost is observable.
   - **GitHub Snapshot adapter** — Actions artifact / Actions cache / PR comment, in the
     GitHub-CI integration node; binds `SnapshotBackend.write`.
2. **Audit** — `spx/36-audit.enabler/54-branch-run-state.enabler` and
   `spx/36-audit.enabler/15-audit-directory.adr.md` authored against the journal interface
   so audit runs persist as event journals (the original "audit does not exist in CI" gap).
3. **Review** — `spx/46-reviewing.enabler/43-review-state.enabler` and
   `spx/46-reviewing.enabler/15-review-directory.adr.md` authored against the journal
   interface so review runs persist as event journals.
