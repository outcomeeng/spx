# Issues: Appendable Journal Store

## FOLLOW-UP — append reads the whole run file to reject a consumed sequence

`createAppendableJournalStore().append` calls `readAll()` to check whether the
incoming `seq` is already persisted, so a run of n appends reads and parses the
file O(n²) times. This is the local-backend face of the journal's deferred
append history-read characteristic
([`spx/15-agent-run-journal.enabler/ISSUES.md`](../../15-agent-run-journal.enabler/ISSUES.md)),
now observable at a real backend.

The dup-check cannot simply be dropped: the spec's
[`appendable-journal-store.md`](appendable-journal-store.md) compliance assertion
and the ADR require `append` to reject a consumed `seq` with `JOURNAL_ERROR.SEQ_CONSUMED`.
The mitigation is therefore a cache, not a removal — maintain the highest persisted
`seq` (or a seq set) in store-instance state, primed by one read at construction and
advanced on each successful append, so the steady-state check is O(1). Settle this
together with the journal's single-writer / sequence-caching follow-up, since both
rest on the one-journal-per-run assumption.
