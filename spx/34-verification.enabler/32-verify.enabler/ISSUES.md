# Issues: verify

## Existing-run verbs address a run by token without matching the selector scope

`resolveExistingRun` (`src/commands/verify/cli.ts`) resolves an existing run by
`(branch, verification type, run token)` and parses `--scope` only for syntactic
validity — it does not match the parsed base/head against the scope recorded at
`start`. This is spec-compliant today: `verify.md` addresses existing-run verbs by
`--run <run-token>`, the unique selector. But a caller that reuses a stale run token
from an earlier changeset on the same branch and type, together with any valid current
`--scope`, resolves and operates on that earlier run — `finish` would seal it — because
the scope selector is never matched to the run.

Cross-lifecycle: matching the selector scope to the recorded scope is a new requirement
affecting all six existing-run verbs (`input`, `append-scope`, `append-finding`, `finish`,
`status`, `render`), not the terminal-projection slice. It lives in the selector grammar the
queued `spx verification run` surface refactor
(`spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md`) reworks. Settle whether existing-run
verbs reject a `--scope` that does not match the run's recorded scope (a new spec assertion +
test) as part of that refactor. Surfaced by codex on PR #346.

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

## A generic journal seal of a verify run desyncs the run's projected sealed state

`projectVerifyRun` (`src/domains/verify/verify.ts`) folds `sealed` from the
presence of a terminal-completion event, which `spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`
decides deliberately — sealed folds from the terminal event, "independent of the
journal seal marker." The generic `spx journal seal --type <verification-type>
--run <run-token>` verb (`src/interfaces/cli/journal.ts`) can seal a verify run's
journal directly, writing the physical seal marker without a terminal-completion
event. The projection then reports `sealed: false` and lists `finish`,
`append-scope`, and `append-finding` as legal next actions, yet every one fails at
the journal layer with `JOURNAL_ERROR.SEALED` — the run is permanently unfinishable
while its own projection claims otherwise.

Cross-node, and not fixable inside the projection: `projectVerifyRun` receives only
the event history, and a physically-sealed-without-terminal run is indistinguishable
from an unsealed run from events alone, so detecting the state there would require
reading the physical marker the ADR forbids the projection to read. The resolution is
a design decision spanning the journal substrate and the verify lifecycle — either
refine the ADR invariant and have `resolveExistingRun` treat a physically-sealed,
terminal-event-absent verify run as a distinct diagnosable state, or add and enforce a
rule preventing `spx journal seal` from targeting a verify-owned run scope directly.
Settle it against the journal-surface node (`spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler`)
and the verify module-structure ADR before implementing. Surfaced by changes-reviewer
on PR #346.
