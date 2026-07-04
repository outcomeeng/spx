# Issues: verify

## `status` next-actions advertise evidence actions without registered validators

`projectVerifyRun` (`src/domains/verify/verify.ts`) reports `UNSEALED_NEXT_ACTIONS` — a
static list including `finding add` — for every unsealed run, regardless of verification
type. The public lifecycle rejects unsupported verification types at `start`, and evidence-add
operations reject a started run type that has no registered validator for the requested evidence
kind, so a launcher that followed `status` for such a type would attempt an action the API rejects.

Current verification-type vocabulary (`VERIFY_VERIFICATION_TYPE`) contains only `review`, whose
implemented evidence boundary validates findings, so `finding add` is legal for every run that can
currently be constructed and the advertised next actions are correct. The gap surfaces when
additional verification types and the evidence-validator registry from
`spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md` introduce
separate `scope` and `finding` validators keyed by verification type and evidence kind. Filtering
`nextActions` by evidence-validator registration now would guard a branch no run can reach. Settle
it with the work that adds the second implemented verification type: decide whether `status` and
`render` next actions filter `scope add` and `finding add` by the run type's registered evidence
validators, and add the covering assertion then.

## A generic journal seal of a verify run desyncs the run's projected sealed state

`projectVerifyRun` (`src/domains/verify/verify.ts`) folds `sealed` from the
presence of a terminal-completion event, which `spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`
decides deliberately — sealed folds from the terminal event, "independent of the
journal seal marker." The generic `spx journal seal --type <verification-type>
--run <run-token>` verb (`src/interfaces/cli/journal.ts`) can seal a verify run's
journal directly, writing the physical seal marker without a terminal-completion
event. The projection then reports `sealed: false` and lists `finish`,
`scope add`, and `finding add` as legal next actions, yet every one fails at
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
