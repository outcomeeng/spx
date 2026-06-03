# Issues: Last-Run Evidence

## FOLLOW-UP: testing → audit timestamp-helper reuse

`src/testing/run-state.ts` reuses `formatAuditRunTimestamp` from `src/domains/audit/run-state.ts` for run-directory naming. The branch-slug reuse (`slugAuditBranchIdentity`) no longer applies: [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md) and [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md) store testing evidence per-worktree under `.spx/local/testing/`, so no branch slug participates in the testing path.

**Impact:** No decision declares `formatAuditRunTimestamp` as a stable, public cross-domain surface. A future refactor of the audit domain could change or move it and alter testing run-directory names with no spec-level signal. The testing → audit dependency for the run-directory timestamp shape is an implicit coupling.

**Resolution options (deferred — the fix touches the audit domain, outside this node's diff):**

- Extract the shared timestamp helper into a neutral utility module that both `src/domains/audit/` and `src/testing/` import; or
- Inline an independent timestamp formatter in the testing module conforming to the `{YYYY-MM-DD_HH-mm-ss-SSS}` shape declared in [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md).

**Evidence:** Surfaced by the local changes review (finding F-004) on `work/typescript-testing-runner`. The per-worktree relocation has removed `slugTestingBranchIdentity` and the `branchSlug` schema field; only the `formatAuditRunTimestamp` reuse above remains.

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks for an existing `state.json` with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when present), then publishes via temp-file + `rename`. The preflight and the `rename` are not atomic: two writers targeting the **same** run directory could both observe no `state.json`, both write distinct temp files, and the second `rename` would overwrite the first's `state.json` — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run-id directory from `createTestRunDirectory`, so two writers never target the same `state.json`; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run directory, which the design does not produce. The audit peer (`writeTerminalAuditRunState`) shares the identical preflight + rename pattern.

**Resolution options (deferred — changes the ADR-mandated rename protocol and would diverge from the reused audit pattern):**

- Replace temp-file + `rename` with temp-file + `link` (which fails `EEXIST` when the target exists) + `unlink`, making no-overwrite atomic and removing the preflight TOCTOU; update `32-terminal-write-protocol.adr.md` and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by the Codex review (P2, `src/testing/run-state.ts` rename site) on PR #65.

## FOLLOW-UP: staleness must invalidate evidence across a within-worktree checkout change

Per-worktree storage under `.spx/local/testing/` removes the branch-slug partition, and the staleness model in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) compares only digests (testing config, test path set, test content, descriptor-declared product inputs) — not the recorded `branchName`/`headSha`. When a developer reuses one worktree and checks out another branch or commit, the previous checkout's `.spx/local/testing/` evidence remains; if the digests still match (for example a source change not covered by a descriptor-declared product input), `spx spec status --update` can treat that evidence as usable and skip the per-node run, recording a stale pass/fail for the new checkout. The prior common-dir `.spx/testing/{branch-slug}/` layout sidestepped the cross-branch case by partitioning on the slug.

**Impact:** Edge case under the product's worktree-per-branch model (Claude Code creates a worktree per branch), but a real correctness gap when one worktree is reused across checkouts. The new staleness model is not yet built, so no running code is affected today.

**Resolution (implementation unit):** the new staleness model must prevent cross-checkout reuse — compare the recorded `branchName`/`headSha` against the current checkout (treating a mismatch as unusable), or an equivalent checkout-identity guard — decided in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) and implemented when the per-node run and `src/testing/run-state.ts` relocation land. That edit also normalizes [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) to the current ADR template (decision lead-text + Rationale + Verification), aligning it with its now-condensed siblings [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md) and [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md).

**Evidence:** Codex review on PR #98 (P2, `11-last-run-directory.adr.md` selection rule); the digest-only staleness inputs in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) and the per-worktree relocation in [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md).

**Skills:** `spec-tree:applying` (implementation), `typescript:architecting-typescript` (staleness ADR), `typescript:coding-typescript` (staleness comparison).

## FOLLOW-UP: node-scoped selection treats an empty node-path set as no coverage

`selectLatestTerminalTestRunForNode` (via `runCoversNode`) returns `undefined` for a node whose `nodeTestPaths` is empty — no run is considered to cover a node that declares no test paths. This is the correct outcome under the delegation contract (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`): only test-bearing, non-`EXCLUDE` nodes reach the resolver, and those always have at least one test path, so a `declared` node never selects evidence. The empty-paths branch is therefore a defensive guard the delegation contract makes unreachable.

**Impact:** None in the intended flow. The branch is untested because the generator's `testPaths` arbitrary enforces `minLength: 1`; no scenario constructs an empty node-path set.

**Resolution (deferred):** If a future caller can pass an empty node-path set, add a generator path and a scenario asserting the no-coverage outcome, or make the contract reject empty input explicitly. Until then the guard's behavior is contract-implied.

**Evidence:** Local changes review on the per-worktree relocation PR (`runCoversNode` empty-paths early return in `src/testing/run-state.ts`).

## FOLLOW-UP: selection ordering has example coverage but no property-based verification

`selectLatestTerminalTestRunForNode` (via `compareTerminalRuns`) orders covering terminal runs by `completedAt`, then `startedAt`, then run-directory name, declared in [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md) and [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md). The scenario suite exercises each ordering axis with a dedicated example (a `completedAt` difference, a `completedAt` tie broken by `startedAt`, and a `completedAt`+`startedAt` tie broken by directory name), so every comparator level has deterministic coverage.

**Impact:** None on the shipped behavior — each axis is covered. The example scenarios do not verify the total order transitively across an arbitrary pool of runs: a regression that broke the reduce-to-maximum over a large mixed pool (rather than a single axis) would escape the example suite.

**Resolution (deferred — wider test architecture than this relocation):** Add a property test that generates a pool of terminal runs with varied timestamps, directory names, and coverage, and asserts `selectLatestTerminalTestRunForNode` returns a covering run that no other covering run compares greater than under the documented `completedAt → startedAt → directory-name` order. This needs a run-pool generator and belongs with the per-node run surface implementation, not this storage relocation.

**Evidence:** Local changes review on the per-worktree relocation PR (F-002): the property suite covers only round-trip fidelity; selection ordering is example-covered only.
