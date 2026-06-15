# Issues: Agent Run Journal

## FOLLOW-UP — append re-reads the full history to derive the next sequence

`createJournal().append()` calls `backend.readAll()` on every append to compute
`seq = JOURNAL_SEQ_BASE + history.length`, so a run of n appends performs O(n²)
backend reads. This re-derive-from-truth design is deliberate: it keeps the
backend authoritative, which is what the shared-backend `SEQ_CONSUMED` rejection
([`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md) compliance
rule) and cursor stability rest on.

Impact is currently low: appends target a **local** Appendable backend, the
remote GitHub backend is Snapshot (write-only projections, no per-append read),
and a run emits a bounded event count. No ADR invariant requires O(1) append.

Revisit when building the adapters ([PLAN.md](PLAN.md) step 1), where a real
backend's `readAll` cost is observable. Any optimization (e.g. lazy-initialised
local sequence caching) MUST preserve cursor stability across restarts and the
shared-backend already-consumed-sequence rejection — a single journal per run is
the design's single-writer assumption, not a guarantee the type enforces.

## FOLLOW-UP — the journal's input-validation boundary is unspecified

`append` copies the caller-supplied CloudEvents values (`id`, `source`, `type`,
`time`) into the persisted event without value-level validation, so malformed
values — an empty `type`, a non-URI `source`, a non-RFC3339 `time` — would become
journal history. `checkJournalEventConformance` and the conformance assertion
verify *structural* conformance (the attribute set, types, and stream extensions),
which the implementation satisfies; CloudEvents *value* rules (non-empty `id`/
`type`, URI-reference `source`, RFC3339 `time`) are not asserted.

This is a contract decision, not a defect against the current spec: does `append`
reject malformed CloudEvents values (and with what error contract), or does the
recording agent guarantee them? Settle it with an ADR + a rejection assertion
when the agent-side recording is specified (audit/review reconciliation), then
implement via `/applying`. Surfaced by Codex review on PR #160.

## FOLLOW-UP — seal enforcement has a time-of-check/time-of-use window

`createJournal().append()` checks `backend.isSealed()` and then `backend.append()`
in separate awaited steps; the backend gates only sequence exclusivity, not seal.
Under a concurrent `seal()` interleaved between the check and the persist, an
append can resolve after the stream is sealed, so the terminal-seal invariant
([`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md)) is not
race-proof.

The invariant holds for the supported usage — one journal per run, a single
writer, `seal()` after the last append — which the compliance test verifies.
Closing the window (an atomic check-and-append, or backend-level seal rejection)
is the same single-writer-vs-concurrent decision as the sequence-caching and
input-validation follow-ups above; settle them together when a backend admits
concurrent writers. Surfaced by Codex review on PR #160.
