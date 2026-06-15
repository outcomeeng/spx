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
