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
