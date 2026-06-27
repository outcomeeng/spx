# Plan: Journal

## Bind the GitHub Appendable store under the github-pr backend

The journal command's `github-pr` backend persists only the runner-local `.spx/`
JSONL and never reaches the durable GitHub Appendable store of
`spx/21-infrastructure.enabler/43-github-ci.enabler/21-artifact-journal-store.enabler`,
so a CI run's event history does not survive between runners.

`src/commands/journal/runtime.ts` `bindJournal` always constructs
`createAppendableJournalStore`; no production caller binds `createArtifactJournalStore`
or calls `hydratePriorRuns`. The store node is built, tested, and verified at `l1`,
but its consumer wiring is not yet in place.

Pending work (its own `/apply` slice on this node, against
`spx/34-verification.enabler/21-journal.enabler/13-journal-module-structure.adr.md`):

- Resolve the run scope's pull request and hydrate prior runs at `open` through
  `hydratePriorRuns`, materializing the pull request's retained artifacts into the
  runner-local run histories before the run's verbs operate.
- Bind `createArtifactJournalStore` as the github-pr Appendable backend so `seal`
  retains the run's JSONL as a per-run Actions artifact, with the real Actions-artifact
  client supplied at the edge.
- Co-locate the journal command tests that exercise the github-pr durable-store path.

This is a separate, larger concern than the store node itself — it changes the journal
command layer and its backend registry, not the `src/lib/` store — so it is tracked here
rather than carried in the store node's changeset. Surfaced by Codex review on PR #293.
