# Issues: Appendable Journal Store

## FOLLOW-UP — the consumed-sequence check is O(n) per append and not atomic across writers

`createAppendableJournalStore().append` calls `readAll()` to check whether the incoming
`seq` is already persisted, then appends — so a run of n appends reads and parses the
file O(n²) times, and two stores appending to the same run path concurrently can both
pass the check before either writes, leaving a duplicate `seq` (a time-of-check /
time-of-use race). Both are the local-backend face of the journal's single-writer-per-run
design and its deferred concurrency follow-ups
([`spx/15-agent-run-journal.enabler/ISSUES.md`](../../15-agent-run-journal.enabler/ISSUES.md)):
the in-memory backend rejects a concurrent duplicate `seq` synchronously, while the file
backend's async check-then-append does not.

The dup-check cannot simply be dropped — the spec's
[`appendable-journal-store.md`](appendable-journal-store.md) compliance assertion and the
ADR require `append` to reject a consumed `seq` with `JOURNAL_ERROR.SEQ_CONSUMED`. A
per-instance seq-set cache fixes only the O(n) cost (and a max-seq cache is insufficient —
any already-seen `seq` must reject, not only one above the maximum). The stronger
mitigation that fixes both at once is an exclusive-create seq claim:
`fs.writeFile(seqClaimPath, "", { flag: "wx" })` makes claiming a `seq` atomic, so a
concurrent or repeat claim fails with `EEXIST` → `SEQ_CONSUMED` in O(1) with no read. It
changes the storage model (a claim marker per `seq`), so settle it with the ADR when the
one-journal-per-run assumption is relaxed.
