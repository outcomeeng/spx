# Plan: fold-only status update

> Reconcile against `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`, `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`, and `spx/34-verification.enabler/PLAN.md` first. This note is coordination, not product truth.

`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` decides that `spx spec status --update` folds recorded verification evidence and executes no verification. The resolver and its tests still execute a per-node run when recorded evidence is stale, failing, or absent, so the implementation is in violation of the decision until this work lands.

## Implementation steps

1. Change the production node-outcome resolver so it reads recorded last-run evidence and invokes no per-node run. A reference whose evidence is fresh takes that evidence's outcome; a reference whose evidence is stale or absent keeps its committed outcome.
2. Rewrite the `--update` execution scenarios in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/spec-cli-commands.scenario.l1.test.ts` — the cases asserting a per-node run on absent, stale, and fresh-but-failing evidence, and the case asserting a re-run when a covered test file is deleted — so they assert the fold instead. The stdout-routing case survives only if `--update` still spawns a process; with no run to spawn, the rollup owns stdout unconditionally.
3. Rewrite the staleness-input caching cases in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/tests/status-testing-delegation.compliance.l1.test.ts`, which reuse cached inputs across a terminal run's evidence refresh. No run refreshes evidence inside a fold, so each case restates the caching guarantee over evidence a prior run recorded.
4. Retire the per-node-run composition from the `--update` descriptor once no caller invokes it.
5. Re-derive every committed `spx.status.json` through the projector on fresh `dist` and confirm the diff carries no unintended node.

Evidence for a node now comes from a recorded run — `spx test` today, and the journal-recorded verification run the program in `spx/34-verification.enabler/PLAN.md` builds.
