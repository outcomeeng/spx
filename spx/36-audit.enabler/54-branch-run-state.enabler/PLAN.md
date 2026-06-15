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

**Chosen depth: full event history.** Audit execution
(`spx/36-audit.enabler/65-auditor-execution.enabler`) emits incremental events
(auditor-started, finding-reported, completed) through the journal; the `AuditRunState`
envelope is the projection folded from that history, and the run `seal`s at terminal
state. This is the largest change surface but the one the journal contract intends and the
one audit-in-CI needs (incremental persistence + rendered PR-comment / check projections).
A storage-only alignment — routing today's single terminal record through the journal as
one event — is the fallback if the execution-event scope proves too large for one slice:
land the storage alignment first and track the per-finding events as a follow-up.

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
- `spx/36-audit.enabler/65-auditor-execution.enabler` (full depth) — emit the per-stage
  events (auditor-started, finding-reported, completed) to the run's journal as execution
  proceeds, so the `AuditRunState` projection folds a real history rather than one record.

## Then: review (symmetric)

Repeat for `spx/46-reviewing.enabler/43-review-state.enabler` +
`spx/46-reviewing.enabler/15-review-directory.adr.md` — review runs as event journals.

## Approach

Per node: `/understanding` → `/contextualizing` → `/applying` (rewrite spec+ADR+tests+impl
to the journal model, keeping tests green so the node never regresses from Passing; three
audit gates) → `/merge`, self-merging under the gates. The journal contract leads (the
`#169` forward-declaration pattern); this is the consumer reconciliation, in place — never
annotate the old model as "superseded".
