# Plan: CLI

## Harness governance (queued)

Govern the still-ungoverned process-lifecycle test harnesses per the **Remaining harness governance program** in `spx/PLAN.md` (uniform approach, audit gates, and literal-collision lessons). One PR for this batch.

Modules to govern (place each governing node beside its owning sub-enabler under `spx/13-cli.enabler`, by the process-lifecycle tests that consume them):

- `testing/harnesses/process-lifecycle/lifecycle.ts`
- `testing/harnesses/process-lifecycle/signal-target.ts`
- `testing/harnesses/process-lifecycle/spawn-fixture.ts`
- `testing/harnesses/validation/subprocess.ts` (the shared subprocess runner — reconcile with the validation batch, do not duplicate)

Note: the EPIPE fixture `testing/fixtures/cli/epipe-emitter.ts` is already governed under `spx/13-cli.enabler` tests; only the process-lifecycle harnesses remain.

Route: `/understand` → `/contextualize spx/13-cli.enabler` → `/author` per-module test-harness enablers → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.

## Styled CLI output (queued)

Add a shared, reusable, **non-interactive** styled-output primitive so `spx diagnose` (and later other commands) render a human report with `/doctor`-grade ergonomics. This is distinct from `spx/13-cli.enabler/21-terminal-ui.adr.md`, which governs only interactive Ink interfaces; styled non-interactive output is currently ungoverned and done ad hoc.

Operator-approved design:

- New enabler under `spx/13-cli.enabler` for the primitive. Place the **pure** styling utility under `src/lib/` per `spx/13-cli.enabler/15-cli-architecture.adr.md` (the shared-pure-helper rule that already homes argument sanitization). No new ADR — placement is governed by 15-cli-architecture and the convention lives in the enabler's own assertions.
- A fixed severity→glyph+color convention shared across commands: ok → green `✓`, warn → yellow `⚠`, error → red `✗`, unknown → red `?`, muted/not-applicable → dim `○`. Plus bold section headers, dim tree-indented detail lines (`├ └`), and a bold overall/summary line colored by severity.
- The **color decision** resolves at the descriptor boundary from TTY + `NO_COLOR` + `--color`/`--no-color`, passed as a boolean to the pure formatter, which builds a chalk `ChalkInstance` at a fixed level — the existing pattern in `src/domains/session/list.ts` (the only current chalk consumer; `chalk` is already a dependency).
- Parity invariant: styling never changes content — a `--no-color`/piped run carries identical verdicts/readings/remediation/overall, just without ANSI. Keep `spx/54-diagnose.enabler/tests/error-sanitization`… and especially the diagnose `text-report.compliance` assertion green by comparing ANSI-stripped content (or rendering with `color: false`).
- Update `spx/54-diagnose.enabler/diagnose.md`'s text-report assertion so the report renders through the primitive (per-check status glyph keyed by the check's bucket), preserving the text↔JSON content-parity assertion.
- Minimal, not a TUI framework. Factor it so `src/domains/session/list.ts` *can* adopt it later, but do not refactor session output in this slice.

Replaces the plain renderer in `src/domains/diagnose/report.ts` (`renderReportText`).

Route: `/understand` → `/contextualize spx/13-cli.enabler` → `/decompose` (place + order the new enabler) → `/author` (enabler spec + the diagnose report-assertion update) → `/apply` (architecture if needed, `/audit-typescript-tests`, `/audit-typescript`) → `/pr` → merge.

Then — and only then — the held `@outcomeeng/spx` publish exposing `spx diagnose` (see `spx/54-diagnose.enabler/PLAN.md` "Remaining"): it is outward-facing and needs operator authorization, and it unblocks the downstream plugins-rewire session `2026-06-21_18-50-28`.
