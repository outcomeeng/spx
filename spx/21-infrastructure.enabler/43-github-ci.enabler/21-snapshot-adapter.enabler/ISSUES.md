# Issues: Snapshot Adapter

## FOLLOW-UP — immutable-surface repeated-write semantics are unspecified

`createGithubSnapshotSink` dispatches each `write` to the configured surface and is fully tested for single-write dispatch and per-run addressing. It does not specify what happens when `write` is called more than once on an immutable surface (`ACTIONS_ARTIFACT` or `ACTIONS_CACHE`) within the same run: the real GitHub Actions artifact-name and cache-key APIs reject a second write under the same name or key, while a PR comment upserts in place.

This is a write-cadence and contract question that belongs with the consumer that drives the sink — the verification run-journal channel `spx/34-verification.enabler` decides how often a run's projection is rendered and written per surface, and whether an immutable surface receives one final write at terminal or a versioned series. Settle the repeated-write contract (assume one write per run, version the key per write, or reject a duplicate) when the github-pr backend binding lands, and extend the sink and its tests to match. The adapter's per-surface dispatch is correct and verified for the single-write-per-run case the journal's single-writer-per-run design currently produces.
