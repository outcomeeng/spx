# Issues: Last-Run Evidence

## FOLLOW-UP: testing → audit timestamp-helper reuse

`src/testing/run-state.ts` reuses `formatAuditRunTimestamp` from `src/domains/audit/run-state.ts` for run-directory naming. The branch-slug reuse (`slugAuditBranchIdentity`) no longer applies: [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md) and [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md) store testing evidence per-worktree under `.spx/local/testing/`, so no branch slug participates in the testing path.

**Impact:** No decision declares `formatAuditRunTimestamp` as a stable, public cross-domain surface. A future refactor of the audit domain could change or move it and alter testing run-directory names with no spec-level signal. The testing → audit dependency for the run-directory timestamp shape is an implicit coupling.

**Resolution options (deferred — the fix touches the audit domain, outside this node's diff):**

- Extract the shared timestamp helper into a neutral utility module that both `src/domains/audit/` and `src/testing/` import; or
- Inline an independent timestamp formatter in the testing module conforming to the `{YYYY-MM-DD_HH-mm-ss-SSS}` shape declared in [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md).

**Code-layer note:** Removing `slugTestingBranchIdentity` and the `branchSlug` schema field is part of the per-worktree relocation's implementation unit.

**Evidence:** Surfaced by the local changes review (finding F-004) on `work/typescript-testing-runner`; the slug half is resolved by the status/testing reconciliation.

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks for an existing `state.json` with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when present), then publishes via temp-file + `rename`. The preflight and the `rename` are not atomic: two writers targeting the **same** run directory could both observe no `state.json`, both write distinct temp files, and the second `rename` would overwrite the first's `state.json` — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run-id directory from `createTestRunDirectory`, so two writers never target the same `state.json`; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run directory, which the design does not produce. The audit peer (`writeTerminalAuditRunState`) shares the identical preflight + rename pattern.

**Resolution options (deferred — changes the ADR-mandated rename protocol and would diverge from the reused audit pattern):**

- Replace temp-file + `rename` with temp-file + `link` (which fails `EEXIST` when the target exists) + `unlink`, making no-overwrite atomic and removing the preflight TOCTOU; update `32-terminal-write-protocol.adr.md` and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by the Codex review (P2, `src/testing/run-state.ts` rename site) on PR #65.

## FOLLOW-UP: tests and implementation assert the superseded branch-slug storage

`tests/run-state.scenario.l1.test.ts`, `tests/run-state.property.l1.test.ts`, and `tests/passing-scope.compliance.l1.test.ts` assert the common-dir `.spx/testing/{branch-slug}/runs/.../state.json` path and the branch-slug API surface (`createTestRunDirectory(productDir, branchSlug)`, `readTestingBranchRuns(productDir, branchSlug)`, `testingBranchDir`/`testingRunsDir(productDir, branchSlug)`, and the `INVALID_BRANCH_SLUG` error). `src/testing/run-state.ts` still implements that surface. The spec layer relocates evidence to per-worktree `.spx/local/testing/` and drops the branch slug, so these tests and that implementation now describe a superseded contract.

**Impact:** The tests pass against the current implementation, so the gate stays green, but they verify the old contract rather than the one the spec now declares — the normal spec-leads-code interim of the spec-then-implementation split.

**Resolution (implementation unit):** In the code-layer PR, relocate `src/testing/run-state.ts` to resolve `.spx/local/testing/` under `productDir`, drop `branchSlug` from the schema and the directory helpers (renaming `readTestingBranchRuns` → `readTestingRuns`), remove `slugTestingBranchIdentity` and `INVALID_BRANCH_SLUG`, and update the three test files to the per-worktree path and API per `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md` and `21-testing-state-storage.adr.md`.

**Skills:** `spec-tree:applying` (implementation), `typescript:testing-typescript` (tests), `typescript:coding-typescript` (storage relocation).

## FOLLOW-UP: staleness must invalidate evidence across a within-worktree checkout change

Per-worktree storage under `.spx/local/testing/` removes the branch-slug partition, and the staleness model in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) compares only digests (testing config, test path set, test content, descriptor-declared product inputs) — not the recorded `branchName`/`headSha`. When a developer reuses one worktree and checks out another branch or commit, the previous checkout's `.spx/local/testing/` evidence remains; if the digests still match (for example a source change not covered by a descriptor-declared product input), `spx spec status --update` can treat that evidence as usable and skip the per-node run, recording a stale pass/fail for the new checkout. The prior common-dir `.spx/testing/{branch-slug}/` layout sidestepped the cross-branch case by partitioning on the slug.

**Impact:** Edge case under the product's worktree-per-branch model (Claude Code creates a worktree per branch), but a real correctness gap when one worktree is reused across checkouts. The new staleness model is not yet built, so no running code is affected today.

**Resolution (implementation unit):** the new staleness model must prevent cross-checkout reuse — compare the recorded `branchName`/`headSha` against the current checkout (treating a mismatch as unusable), or an equivalent checkout-identity guard — decided in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) and implemented when the per-node run and `src/testing/run-state.ts` relocation land. That edit also normalizes [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) to the current ADR template (decision lead-text + Rationale + Verification), aligning it with its now-condensed siblings [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md) and [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md).

**Evidence:** Codex review on PR #98 (P2, `11-last-run-directory.adr.md` selection rule); the digest-only staleness inputs in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) and the per-worktree relocation in [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md).

**Skills:** `spec-tree:applying` (implementation), `typescript:architecting-typescript` (staleness ADR), `typescript:coding-typescript` (staleness comparison).
