# Issues: Last-Run Evidence

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks whether the reserved run file is empty with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when content is present), then writes the JSONL record into the same file. The preflight and the write are not atomic: two writers targeting the **same** run file could both observe an empty file, then one writer's record could overwrite the other — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run file from `createTestRunFile`, so two writers never target the same file; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run file. The audit peer (`writeTerminalAuditRunState`) shares the identical reserved-file fill pattern.

**Resolution options (deferred — changes the ADR-mandated reserved-file protocol and would diverge from the reused audit pattern):**

- Replace the reserved-empty-file fill with a separate lock/commit protocol or an append protocol that rejects a second terminal record, making no-overwrite atomic and removing the preflight TOCTOU; update `32-terminal-write-protocol.adr.md` and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by the Codex review (P2, `src/testing/run-state.ts` rename site) on PR #65.

## FOLLOW-UP: staleness must invalidate evidence across a within-worktree checkout change

Per-worktree storage under `.spx/worktree/test/` removes the branch-slug partition, and the staleness model in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) compares only digests (testing config, test path set, test content, descriptor-declared product inputs) — not the recorded `branchName`/`headSha`. When a developer reuses one worktree and checks out another branch or commit, the previous checkout's `.spx/worktree/test/` evidence remains; if the digests still match (for example a source change not covered by a descriptor-declared product input), `spx spec status --update` can treat that evidence as usable and skip the per-node run, recording a stale pass/fail for the new checkout. The prior common-dir `.spx/testing/{branch-slug}/` layout sidestepped the cross-branch case by partitioning on the slug.

**Impact:** Edge case under the product's worktree-per-branch model (Claude Code creates a worktree per branch), but a real correctness gap when one worktree is reused across checkouts. The new staleness model is not yet built, so no running code is affected today.

**Resolution (implementation unit):** the new staleness model must prevent cross-checkout reuse — compare the recorded `branchName`/`headSha` against the current checkout (treating a mismatch as unusable), or an equivalent checkout-identity guard — decided in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) and implemented when the per-node run and `src/testing/run-state.ts` relocation land. That edit also normalizes [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) to the current ADR template (decision lead-text + Rationale + Verification), aligning it with its now-condensed siblings [`11-last-run-file.adr.md`](11-last-run-file.adr.md) and [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md).

**Evidence:** Codex review on PR #98 (P2, `11-last-run-file.adr.md` selection rule); the digest-only staleness inputs in [`43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) and the per-worktree relocation in [`11-last-run-file.adr.md`](11-last-run-file.adr.md).

**Skills:** `spec-tree:applying` (implementation), `typescript:architecting-typescript` (staleness ADR), `typescript:coding-typescript` (staleness comparison).

## FOLLOW-UP: node-scoped selection treats an empty node-path set as no coverage

`selectLatestTerminalTestRunForNode` (via `runCoversNode`) returns `undefined` for a node whose `nodeTestPaths` is empty — no run is considered to cover a node that declares no test paths. This is the correct outcome under the delegation contract (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`): only test-bearing, non-`EXCLUDE` nodes reach the resolver, and those always have at least one test path, so a `declared` node never selects evidence. The empty-paths branch is therefore a defensive guard the delegation contract makes unreachable.

**Impact:** None in the intended flow. The branch is untested because the generator's `testPaths` arbitrary enforces `minLength: 1`; no scenario constructs an empty node-path set.

**Resolution (deferred):** If a future caller can pass an empty node-path set, add a generator path and a scenario asserting the no-coverage outcome, or make the contract reject empty input explicitly. Until then the guard's behavior is contract-implied.

**Evidence:** Local changes review on the per-worktree relocation PR (`runCoversNode` empty-paths early return in `src/testing/run-state.ts`).

## FOLLOW-UP: selection ordering has example coverage but no property-based verification

`selectLatestTerminalTestRunForNode` (via `compareTerminalRuns`) orders covering terminal runs by `completedAt`, then `startedAt`, then run file name, declared in [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md) and [`11-last-run-file.adr.md`](11-last-run-file.adr.md). The scenario suite exercises each ordering axis with a dedicated example (a `completedAt` difference, a `completedAt` tie broken by `startedAt`, and a `completedAt`+`startedAt` tie broken by file name), so every comparator level has deterministic coverage.

**Impact:** None on the shipped behavior — each axis is covered. The example scenarios do not verify the total order transitively across an arbitrary pool of runs: a regression that broke the reduce-to-maximum over a large mixed pool (rather than a single axis) would escape the example suite.

**Resolution (deferred — wider test architecture than this relocation):** Add a property test that generates a pool of terminal runs with varied timestamps, file names, and coverage, and asserts `selectLatestTerminalTestRunForNode` returns a covering run that no other covering run compares greater than under the documented `completedAt → startedAt → file-name` order. This needs a run-pool generator and belongs with the per-node run surface implementation, not this storage relocation.

**Evidence:** Local changes review on the per-worktree relocation PR (F-002): the property suite covers only round-trip fidelity; selection ordering is example-covered only.
