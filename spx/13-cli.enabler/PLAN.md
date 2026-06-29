# Plan: CLI

## Harness governance (queued)

Govern the still-ungoverned process-lifecycle test harnesses using the node-local harness-governance pattern: author per-module test-harness enablers, run the spec-auditor and test-evidence-auditor gates including coverage, and carry the literal-collision lessons from the completed recording-runner batch in `spx/41-test.enabler/PLAN.md`. One PR for this batch.

Modules to govern (place each governing node beside its owning sub-enabler under `spx/13-cli.enabler`, by the process-lifecycle tests that consume them):

- `testing/harnesses/process-lifecycle/lifecycle.ts`
- `testing/harnesses/process-lifecycle/signal-target.ts`
- `testing/harnesses/process-lifecycle/spawn-fixture.ts`
- `testing/harnesses/validation/subprocess.ts` (the shared subprocess runner — reconcile with the validation batch, do not duplicate)

Note: the EPIPE fixture `testing/fixtures/cli/epipe-emitter.ts` is already governed under `spx/13-cli.enabler` tests; only the process-lifecycle harnesses remain.

Route: `/understand` → `/contextualize spx/13-cli.enabler` → `/author` per-module test-harness enablers → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
