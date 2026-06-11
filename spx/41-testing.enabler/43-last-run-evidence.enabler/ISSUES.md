# Issues: Last-Run Evidence

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks whether the reserved run file is empty with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when content is present), then writes the JSONL record into the same file. The preflight and the write are not atomic: two writers targeting the **same** run file could both observe an empty file, then one writer's record could overwrite the other — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run file from `createTestRunFile`, so two writers never target the same file; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run file. The audit peer (`writeTerminalAuditRunState`) shares the identical reserved-file fill pattern.

**Resolution options (deferred — changes the ADR-mandated reserved-file protocol and would diverge from the reused audit pattern):**

- Replace the reserved-empty-file fill with a separate lock/commit protocol or an append protocol that rejects a second terminal record, making no-overwrite atomic and removing the preflight TOCTOU; update `32-terminal-write-protocol.adr.md` and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by automated review (P2, `src/testing/run-state.ts` rename site) on PR #65.

## FOLLOW-UP: node-scoped selection treats an empty node-path set as no coverage

`selectLatestTerminalTestRunForNode` (via `runCoversNode`) returns `undefined` for a node whose `nodeTestPaths` is empty — no run is considered to cover a node that declares no test paths. This is the correct outcome under the delegation contract (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`): only test-bearing, non-`EXCLUDE` nodes reach the resolver, and those always have at least one test path, so a `declared` node never selects evidence. The empty-paths branch is therefore a defensive guard the delegation contract makes unreachable.

**Impact:** None in the intended flow. The branch is untested because the generator's `testPaths` arbitrary enforces `minLength: 1`; no scenario constructs an empty node-path set.

**Resolution (deferred):** If a future caller can pass an empty node-path set, add a generator path and a scenario asserting the no-coverage outcome, or make the contract reject empty input explicitly. Until then the guard's behavior is contract-implied.

**Evidence:** Local changes review on the per-worktree relocation PR (`runCoversNode` empty-paths early return in `src/testing/run-state.ts`).
