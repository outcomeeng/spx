# Issues: verify

## `status` next-actions advertise evidence actions without registered validators

`projectVerifyRun` (`src/domains/verify/verify.ts`) reports `UNSEALED_NEXT_ACTIONS` — a
static list including `finding add` — for every unsealed run, regardless of verification
type. The public lifecycle rejects unsupported verification types at `start`, and evidence-add
operations reject a started run type that has no registered validator for the requested evidence
kind, so a launcher that followed `status` for such a type would attempt an action the API rejects.

Current verification-type vocabulary (`VERIFY_VERIFICATION_TYPE`) contains `review` and `audit`.
Both implemented evidence boundaries register `scope` and `finding` validators, so `scope add` and
`finding add` are legal for every constructible run and the advertised next
actions are correct. The gap surfaces when an additional verification type registers only part of
the evidence-action surface. Decide whether `status` and `render` next actions filter `scope add`
and `finding add` by the run type's registered evidence validators before adding such a type, and
add the covering assertion then.

The spx-driven command path (`spx verification <type> run`, per
`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`) raises the same
gap on the command surface rather than the validator registry: spx opens, streams, and seals such a
run within one invocation, so no caller ever appends to it. A run left unsealed by an aborted
invocation would still advertise `scope add` and `finding add` — actions no caller should invoke on
a run spx drives. **Resolved:** next actions filter by the run's drive mode, recorded at `start`, so
an unsealed spx-driven run advertises no caller evidence-append action — the assertions are declared
in `spx/34-verification.enabler/32-verify.enabler/verify.md` (`start` records drive mode; status and
render filter by it) and consumed by `spx/34-verification.enabler/43-execute.enabler`. Seal-on-abort
is best-effort only — a `SIGKILL` runs no cleanup — so the drive-mode filter, not sealing, is the
mechanism. Implementation lands in `/apply` on the executor node.

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

## The verify module names diverge from the command domain they compose

`spx/14-cli-composition.adr.md` places a command domain's three layers at
`src/domains/{domain}/`, `src/commands/{domain}/`, and `src/interfaces/cli/{domain}.ts`. This
domain registers under the name `verification` — its `Domain.name` is the root command name — while
its modules are `src/domains/verify/`, `src/commands/verify/`, and `src/interfaces/cli/verify.ts`,
so `{domain}` and the module segment disagree. `spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`
records the `verify` paths, which keeps that ADR self-consistent but not consistent with the
composition ADR it cites.

Renaming the three module segments to `verification` reconciles them, and touches every importer of
the verify domain, the CLI registry, and the verify test harness. Settle whether the composition
ADR's `{domain}.ts` rule binds the module segment to the registered domain name, or admits a module
name that differs from the command name, before renaming.

## The lifecycle-operation `### Mappings` assertion cites scenario evidence for four rows

`verify.md`'s single `### Mappings` assertion ("Verification-run lifecycle operations map to run
behavior: …") enumerates seven operation→behavior rows, each with its own `[test]` citation. Four
rows — `start` creates context and journal, `input` returns recorded input, `finish` records
terminal completion and seals, and `render` projects the journal — cite only a `scenario`-typed
test (`verify-start.scenario.l1`, `verify-input.scenario.l1`, `verify-lifecycle.scenario.l1`,
`verify-render.scenario.l1`). A scenario proves one existential case, so it does not establish the
row as a universal input→output correspondence the way a `### Mappings` claim asserts; the other
three rows (`scope`, `finding`, `status`) pair a `compliance`-typed test and are adequately backed.
The sibling `compliance` tests for the four rows exercise rejection and edge paths
(`verify-start.compliance` covers start's failure/cleanup paths, not the happy-path create), so the
happy-path mapping behavior is genuinely scenario-covered and a citation swap does not close the
gap.

**Resolution:** restructure this assertion — move the four happy-path lifecycle-flow rows to a
`### Scenarios` heading (they demonstrate specific interactions), keeping only universal-backed rows
under `### Mappings`, or author parameterized mapping evidence for the operation→behavior
correspondence and cite it. Settle whether the lifecycle operation→behavior correspondence is a
mapping or a set of scenarios before editing.

**Tracking classification:** pre-existing content outside this changeset's shipped diff (the
drive-mode retag touched only the two `[test]`/`[audit]` bullets); a verify-lifecycle spec-structure
concern independent of the reporter work that carries the diff. Surfaced by `spec-auditor` while
auditing the drive-mode-assertion retag.

**Evidence:** `spec-auditor` full-node audit of `verify.md`;
`spx/34-verification.enabler/32-verify.enabler/21-run-context.enabler/tests/`,
`.../43-terminal-projection.enabler/tests/`; the assertion-type routing in
`/understand` `references/assertion-types.md`.
