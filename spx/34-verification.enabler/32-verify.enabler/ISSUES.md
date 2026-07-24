# Issues: verify

## `status` next-actions advertise evidence actions without registered validators

`projectVerifyRun` (`src/domains/verify/verify.ts`) advertises an unsealed run's next actions
through `unsealedNextActionsForDriveMode`: a caller-driven run gets the full static
`UNSEALED_NEXT_ACTIONS` list (including `finding add`), and an spx-driven run drops the caller
evidence-append actions. For a caller-driven run the list is static regardless of verification
type. The public lifecycle rejects unsupported verification types at `start`, and evidence-add
operations reject a started run type that has no registered validator for the requested evidence
kind, so a launcher that followed `status` for such a type would attempt an action the API rejects.

Current verification-type vocabulary (`VERIFY_VERIFICATION_TYPE`) contains `audit`, `review`, and
`test`. All three evidence boundaries register `scope`, `finding`, and terminal validators, so
`scope add` and `finding add` are legal for every constructible run and the advertised next
actions are correct. The gap surfaces when an additional caller-driven verification type registers
only part of the evidence-action surface. Decide whether `status` and `render` next actions filter
`scope add` and `finding add` by the run type's registered evidence validators before adding such a
type, and add the covering assertion then.

The spx-driven command path (`spx verification <type> run`, per
`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`) raises the same
gap on the command surface rather than the validator registry: spx opens, streams, and seals such a
run within one invocation, so no caller ever appends to it. A run left unsealed by an aborted
invocation would still advertise `scope add` and `finding add` — actions no caller should invoke on
a run spx drives. **Resolved and implemented:** `unsealedNextActionsForDriveMode` filters the next
actions by the run's drive mode, recorded at `start`, so an unsealed spx-driven run advertises no
caller evidence-append action — declared in `spx/34-verification.enabler/32-verify.enabler/verify.md`
(`start` records drive mode; status and render filter by it), consumed by
`spx/34-verification.enabler/43-execute.enabler`, and covered by
`spx/34-verification.enabler/32-verify.enabler/32-evidence-append.enabler/tests/verify-drive-mode.compliance.l1.test.ts`.
Seal-on-abort is best-effort only — a `SIGKILL` runs no cleanup — so the drive-mode filter, not
sealing, is the mechanism.

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

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Migrated:** the evidence-payload and terminal-completion rejection path. `src/domains/verify/rejection-report.ts` composes that block through `src/lib/terminal-text/`, escaping the caller-supplied verification type while the labels, the validator reason, and the block's line structure stay product-authored.

**Unescaped sites:**

- `src/interfaces/cli/verify.ts` — every non-rejection result reported through `src/interfaces/cli/lib/stream-report.ts`: the start, input, status, render, and finish reports, carrying git refs, journal file content, and stdin or file payloads
- `src/commands/verify/cli.ts` — the run-not-found, payload-read, and append-failure diagnostics, which interpolate caught-error messages and selector values into a plain string

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose the remaining terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](../../54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence, and `src/domains/verify/rejection-report.ts` now carries it for the rejection path.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching one of the named unescaped sites.
