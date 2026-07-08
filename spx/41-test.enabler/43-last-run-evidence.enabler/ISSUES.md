# Issues: Last-Run Evidence

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks whether the reserved run file is empty with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when content is present), then writes the JSONL record into the same file. The preflight and the write are not atomic: two writers targeting the **same** run file could both observe an empty file, then one writer's record could overwrite the other — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run file from `createTestRunFile`, so two writers never target the same file; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run file. The audit peer (`writeTerminalAuditRunState`) shares the identical reserved-file fill pattern.

**Resolution options (deferred — changes the ADR-mandated reserved-file protocol and would diverge from the reused audit pattern):**

- Replace the reserved-empty-file fill with a separate lock/commit protocol or an append protocol that rejects a second terminal record, making no-overwrite atomic and removing the preflight TOCTOU; update `32-terminal-write-protocol.adr.md` and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by automated review (P2, `src/test/run-state.ts` rename site) on PR #65.

## FOLLOW-UP: node-scoped selection treats an empty node-path set as no coverage

`selectLatestTerminalTestRunForNode` (via `runCoversNode`) returns `undefined` for a node whose `nodeTestPaths` is empty — no run is considered to cover a node that declares no test paths. This is the correct outcome under the delegation contract (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`): only test-bearing, non-`EXCLUDE` nodes reach the resolver, and those always have at least one test path, so a `declared` node never selects evidence. The empty-paths branch is therefore a defensive guard the delegation contract makes unreachable.

**Impact:** None in the intended flow. The branch is untested because the generator's `testPaths` arbitrary enforces `minLength: 1`; no scenario constructs an empty node-path set.

**Resolution (deferred):** If a future caller can pass an empty node-path set, add a generator path and a scenario asserting the no-coverage outcome, or make the contract reject empty input explicitly. Until then the guard's behavior is contract-implied.

**Evidence:** Local changes review on the per-worktree relocation PR (`runCoversNode` empty-paths early return in `src/test/run-state.ts`).

## FOLLOW-UP: `toErrorMessage` diverges from the `src/lib/state-store` copy

Hardening `toErrorMessage` in `src/test/run-state.ts` to resolve SonarQube S6551
(guarded `JSON.stringify` instead of `String(error)` for non-Error, non-string
thrown values) made it diverge from the private `toErrorMessage` at
`src/lib/state-store/index.ts:570`, which still uses `String(error)`. The two
agree on the common Error/string path but differ on non-standard throws
(`throw undefined`, `throw { … }`). A third copy lives in
`src/domains/worktree/occupancy-store.ts`.

**Resolution (deferred — blocked by the SonarQube whole-file gate):** consolidate
into one exported `toErrorMessage` in `src/lib/state-store/index.ts` consumed by
`run-state.ts`, the CLI error handler, and `occupancy-store.ts`. A one-line edit
to `src/lib/state-store/index.ts` re-flags four pre-existing SonarQube findings in
that file under the local whole-changed-file gate (verified by probe), which the
SonarQube-zero-issues program owns. Do the consolidation in that program's pass,
or when `src/lib/state-store/index.ts` is next edited for its own reason.

**Evidence:** spec-tree-review on PR #239 (`run-state.ts` ↔
`src/lib/state-store/index.ts:570`); local SonarQube finding probe surfacing four
state-store findings from a one-line edit.
