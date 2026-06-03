# Plan: PR-3b — wire `spx spec status --update` to the testing-evidence resolver

Final increment of the status/testing reconciliation cascade (PR-3a read-back is merged). Architecture (Step 3–4 of `/spec-tree:applying`) is APPROVED; the remaining work is Steps 5–8 (tests → code → audits) plus commit and PR. Governed by `21-status-testing-delegation.adr.md`, `spx/31-spec-domain.enabler/21-node-status.enabler/{15-status-file-contract.pdr.md,21-node-status-architecture.adr.md}`, `spx/41-testing.enabler/71-execution-recording.adr.md`, and `spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`.

## Intended interfaces (the tests target these)

- **Shared current-staleness-inputs recipe** — `src/commands/testing/` (new module, e.g. `staleness.ts`, re-exported from `src/commands/testing/index.ts`): `currentStalenessInputs(productDir, coveredTestPaths, deps) => Promise<StalenessInputs>`. Computes the four digests (testing-config digest via the existing `resolveTestingConfig` recipe; `digestTestPaths(coveredPaths)`; `digestTestContents(readCoveredContents(...))`; `NO_PRODUCT_INPUT_DIGESTS`). `recordRun` in `run-command.ts` is refactored to assemble its recorded inputs through this same function — record and read share one recipe (71 amendment).
- **Node-outcome resolver** — `src/commands/spec/node-outcome-resolver.ts`: `createNodeOutcomeResolver({ productDir, registry, runnerDepsFor, git?, fs?, now? }) => NodeOutcomeResolver`. For a node id: derive its test paths via `discoverTestFiles(productDir)` filtered to the node path (`<ROOT>/<nodeId>/`); `selectLatestTerminalTestRunForNode(readTestingRuns(...).terminalRuns, nodeTestPaths)`; usable = run present AND `isStalenessMatch(extractStalenessInputs(run.state), currentStalenessInputs(productDir, nodeTestPaths, ...))` AND `run.state.status === PASSED` → return true with no run; otherwise (stale/failing/absent) `runNodeCommand({ productDir, nodePath }, deps)` and return `recorded.status === PASSED`.
- **`NodeOutcomeResolver` type** — owned by `src/lib/node-status` (the param type the `--update` orchestration accepts). Rename `update.ts`'s `NodeTestRunner` → `NodeOutcomeResolver` and the `UpdateNodeStatusOptions.runNodeTests` field → `resolveOutcome` (refactor-means-rename). The orchestration already consults the resolver only for test-outcome-stage nodes (`hasTests && !isExcluded`).
- **`statusCommand`** — `StatusOptions` gains `update?: boolean` and `resolveOutcomeFor?: (productDir: string) => NodeOutcomeResolver` (default = production factory built from real testing deps). When `update` and no injected `source`: resolve `productDir`, build the resolver, `await updateNodeStatus({ productDir, resolveOutcome })`, then run the normal read-back snapshot + render so the rollup reflects the just-written `spx.status.json` (scenario 5).
- **Spec descriptor** (`src/interfaces/cli/spec.ts`): add the `--update` option; the descriptor owns the flag and process boundary, composes the production resolver factory, and passes `update` to `statusCommand`.

## Tests (Step 5, RED) — new behavior only; the rename updates existing tests in Step 7

- `54-spec-cli-commands.enabler/tests/spec-cli-commands.scenario.l1.test.ts`:
  - Scenario 5: `--update` writes each node's `spx.status.json` and the command output equals the rollup `spx spec status` renders. Inject `resolveOutcomeFor` with a `createRecordingCommandRunner`.
  - Scenario 7: a node whose recorded evidence is **absent** (no prior run) and one whose evidence is **stale** (record a run, then mutate a covered test file) → `--update` invokes the per-node run (recording runner `.calls` non-empty for that node); a node with **usable** evidence (freshly recorded passing run) → `--update` invokes no per-node run for it.
- `21-node-status.enabler/tests/node-status.compliance.l1.test.ts`: delegation — wrap the harness outcome resolver in a recording resolver; assert `updateNodeStatus` consults it for exactly the test-outcome-stage nodes (`hasTests && !isExcluded`) and never for `declared`/`specified` nodes.

## Rename ripple (Step 7, refactor with the impl)

`NodeTestRunner`→`NodeOutcomeResolver`, `runNodeTests`→`resolveOutcome` across: `src/lib/node-status/update.ts`, `src/lib/node-status/index.ts`, `testing/harnesses/node-status/node-status.ts` (`ClassificationTreeEnv.runNodeTests` field), and the existing `node-status.scenario.l1.test.ts` + `node-status.compliance.l1.test.ts` call sites. Update them together so the existing suites stay green after the rename.

## Step sequence remaining

Step 5 testing → Step 6 test audit (delegated) → Step 7 coding → Step 8 code audit (delegated) → `/spec-tree:committing-changes` (concern-split: `spec` for the ADR amendments already in the worktree, `test`, `feat`, `docs` for PLAN/ISSUES) → `/spec-tree:opening-pr` (REVIEW_READINESS: `spx validation all` 6/6 + full `pnpm test` once + changes-reviewer to convergence) → PR heartbeat → `/spec-tree:managing-pr` to merge. After merge, the cascade is complete and `/handoff` is the next step.
