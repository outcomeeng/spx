# Issues: verify

## `finish` idempotent branch does not retry a failed seal

`verifyFinishCommand` (`src/commands/verify/cli.ts`) appends the terminal event and then
seals in separate steps. If the terminal-event append succeeds but the subsequent
`journalSealCommand` fails or is interrupted — realistic on the github-pr backend, whose
seal write is a network call — every later `finish` reads a history that already carries the
terminal event and takes the idempotent early-return branch, so the seal is never retried and
the run's physical `metadata.sealed` marker stays false. Projected status still reports
`sealed: true` (the projection treats the terminal event as authoritative, independent of the
marker, which is the ADR's intended design), but `journal read-set --sealed` and
`journal list --sealed` filter on the physical marker, so a terminally-complete run whose seal
write failed is permanently excluded from the sealed-run enumeration.

Out of the terminal-projection slice: this is a github-pr-backend robustness concern in the
same family as the github-pr hydration gap below, and `finish` is rewritten by the queued
`spx verification run` surface refactor
(`spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md`). Fix in that rewrite: in the
idempotent branch, re-issue `journalSealCommand` when the run is not yet physically sealed
(tolerating an already-sealed outcome) so a retry converges the marker. Surfaced by
changes-reviewer on PR #346.

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
