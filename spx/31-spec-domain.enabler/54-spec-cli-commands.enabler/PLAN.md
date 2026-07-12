# Plan: fold-only status update

> Reconcile against `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`, `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`, and `spx/34-verification.enabler/PLAN.md` first. This note is coordination, not product truth.

`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` decides that `spx spec status --update` folds recorded verification evidence and executes no verification. The resolver and its tests still execute a per-node run when recorded evidence is stale, failing, or absent, so the implementation is in violation of the decision until this work lands.

## Prerequisite: per-reference recorded evidence

The fold cannot land before recorded evidence resolves a **single evidence reference**. A recorded `TestRunnerOutcome` (`spx/41-test.enabler/43-last-run-evidence.enabler/11-last-run-file.adr.md`) carries one exit code for a whole runner invocation over many test paths, so a batched run covering a passing reference and a failing one records a single non-zero outcome across both. Folding that marks every reference in the invocation failed.

The per-node run this decision removes is what supplied the missing granularity: scoping a run to one node made the invocation's exit code that node's verdict. Deleting the run therefore requires evidence that reports an outcome per reference, which the journal-recorded verification run in `spx/34-verification.enabler/PLAN.md` produces — a custom Vitest reporter appends one scope event per test module and one finding per failing case. That slice comes first; the fold is its consumer.

Persisting the adapter's per-file failing paths into the run-state schema is rejected: it buys the same granularity by extending the very recording the program retires, and expires the moment the reporter lands.

## Implementation steps

The node specs still declare the execute-on-update behavior their tests verify and their committed status claims. A spec assertion carrying `[test]` evidence is a claim that the linked test verifies it, so the assertion text moves only together with the test that proves it — a spec that declares the fold while its linked test proves a per-node run, and whose `spx.status.json` records that test `passed`, claims evidence it does not have. The decision records lead; these assertions follow in the step that rewrites their tests.

1. Change the production node-outcome resolver so it reads recorded last-run evidence and invokes no per-node run. A reference a recorded run covers takes that run's outcome when the evidence is fresh and keeps its committed outcome when the evidence is stale; a reference no recorded run covers resolves to `not-run`. The resolver must therefore distinguish an uncovered reference from a covered-but-stale one — preserving an outcome no run produces would let every regeneration reproduce it, so CI could never refute it.
2. Rewrite the `--update` execution scenarios in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/spec-cli-commands.scenario.l1.test.ts` — the cases asserting a per-node run on absent, stale, and fresh-but-failing evidence, and the case asserting a re-run when a covered test file is deleted — so they assert the fold instead. The stdout-routing case survives only if `--update` still spawns a process; with no run to spawn, the rollup owns stdout unconditionally.
3. Rewrite the staleness-input caching cases in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/status-testing-delegation.compliance.l1.test.ts`, which reuse cached inputs across a terminal run's evidence refresh. No run refreshes evidence inside a fold, so each case restates the caching guarantee over evidence a prior run recorded.
4. Retire the per-node-run composition from the `--update` descriptor once no caller invokes it.
5. Amend the assertions in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/spec-cli-commands.md` and `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md` to declare the fold, in the same change that rewrites the tests proving it.
6. Re-derive every committed `spx.status.json` through the projector on fresh `dist` and confirm the diff carries no unintended node.

Evidence for a node now comes from a recorded run — `spx test` today, and the journal-recorded verification run the program in `spx/34-verification.enabler/PLAN.md` builds.
