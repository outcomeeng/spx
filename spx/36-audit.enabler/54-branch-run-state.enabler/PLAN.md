# Plan: reconcile audit run-state onto the agent-run journal

The event-store contract `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md`
(on main) declares that **every audit or review run is one named, append-only event
journal**, with the terminal record a *projection* rendered from the event history. This
node currently models a run as a single **write-once terminal `AuditRunState` JSONL
record** (`15-audit-directory.adr.md`, `branch-run-state.md`,
`src/commands/audit/run-state.ts`), so it is in violation of the governing contract and
must be reconciled down to it. The local Appendable backend
`src/lib/appendable-journal-store/` (merged) persists a journal over exactly this
`.spx/branch/{slug}/audit/runs/run-{token}.jsonl` layout.

## Target model

An audit run is a journal bound to the local Appendable backend over the run file path:
events append under a monotonic `seq`, the run `seal`s at terminal state, and the
`AuditRunState` envelope is rendered as a projection of the event history rather than
written as a bespoke terminal record.

Two reconciliation depths — pick per scope at execution:

- **Minimal (storage alignment):** route the existing single terminal `AuditRunState`
  through the journal interface — one `append` carrying the envelope as event `data`,
  then `seal`; `readAuditBranchRuns` renders the envelope from the journal. Behavior is
  unchanged; only the storage routes through the journal + local adapter. Richer
  per-finding events become a follow-up.
- **Full (event history):** audit execution (`spx/36-audit.enabler/65-auditor-execution.enabler`)
  emits incremental events (auditor-started, finding-reported, completed); the
  `AuditRunState` projection folds the history. Larger — touches auditor execution.

## Affected files (one `/applying` cycle, node kept Passing throughout)

- `spx/36-audit.enabler/15-audit-directory.adr.md` — rewrite the storage decision from
  write-once terminal record to the journal model (events + projection + seal), in place.
- `spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md` — rewrite the
  assertions to the journal model.
- `src/commands/audit/run-state.ts` — bind `createJournal` to `createAppendableJournalStore`
  over the run path; replace `writeTerminalAuditRunState` with append+seal of the envelope
  event; render the `AuditRunState` projection in `readAuditBranchRuns`.
- `spx/36-audit.enabler/54-branch-run-state.enabler/tests/` — rewrite the 3 tests to the
  journal model (still l1 over a real in-memory `StateStoreFileSystem`).

## Then: review (symmetric)

Repeat for `spx/46-reviewing.enabler/43-review-state.enabler` +
`spx/46-reviewing.enabler/15-review-directory.adr.md` — review runs as event journals.

## Approach

Per node: `/understanding` → `/contextualizing` → `/applying` (rewrite spec+ADR+tests+impl
to the journal model, keeping tests green so the node never regresses from Passing; three
audit gates) → `/merge`, self-merging under the gates. The journal contract leads (the
`#169` forward-declaration pattern); this is the consumer reconciliation, in place — never
annotate the old model as "superseded".
