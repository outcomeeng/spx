# Issues: verify

## Read-only projections reject github-pr-hydrated runs

`resolveExistingRun` (`src/commands/verify/cli.ts`) confirms a run was started by
requiring its recorded input record, and rejects a run whose input record is
absent with the run-not-found diagnostic. github-pr prior-run hydration
(`hydratePriorRuns` in `src/lib/artifact-journal-store/index.ts`, driven by
`src/commands/journal/cli.ts`) restores a prior run's journal body and seal
marker but not its verify input record. A read-only `status` or `render` against
such a hydrated run therefore reports run-not-found even though the sealed
journal is present and projectable.

The fix belongs with the github-pr hydration lifecycle — either hydration
restores the input record alongside the journal, or the read-only projection
verbs resolve a run from its journal without gating on the input record. The
hydration path is outside the terminal-projection slice's diff, so this is
tracked here rather than fixed in that change.
