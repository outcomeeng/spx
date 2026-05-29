# Issues: Last-Run Evidence

## FOLLOW-UP: testing → audit cross-domain helper coupling

`src/testing/run-state.ts` reuses `formatAuditRunTimestamp` and `slugAuditBranchIdentity` from `src/domains/audit/run-state.ts`. The reuse is mandated by [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md) ("Reuse the audit branch slug implementation for testing branch slugs"; "Name run directories with the audit timestamp-plus-run-id shape") and acknowledged in [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md).

**Impact:** No decision declares those audit helpers as a stable, public cross-domain surface. A future refactor of the audit domain could change or move them and break testing state with no spec-level signal. The testing → audit dependency direction is an implicit architectural coupling.

**Resolution options (deferred — the fix touches the audit domain, outside this node's diff):**

- Declare the slug and run-directory helpers as a public, stable surface in the audit domain's decision record, with a compliance rule that testing depends on it; or
- Extract the shared slug and timestamp helpers into a neutral utility module that both `src/domains/audit/` and `src/testing/` import, and update both decision records to reference it.

**Evidence:** Surfaced by the local changes review (finding F-004) on `work/typescript-testing-runner`.

## FOLLOW-UP: terminal-write no-overwrite is not atomic against concurrent same-directory writers

`writeTerminalTestRunState` checks for an existing `state.json` with a preflight `readFile` (returning `STATE_ALREADY_EXISTS` when present), then publishes via temp-file + `rename`. The preflight and the `rename` are not atomic: two writers targeting the **same** run directory could both observe no `state.json`, both write distinct temp files, and the second `rename` would overwrite the first's `state.json` — violating the write-once invariant in [`32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

**Impact:** None in the intended flow. Each run gets a unique random run-id directory from `createTestRunDirectory`, so two writers never target the same `state.json`; the preflight enforces write-once for the sequential re-write case. The race is reachable only under concurrent writes to a deliberately shared run directory, which the design does not produce. The audit peer (`writeTerminalAuditRunState`) shares the identical preflight + rename pattern.

**Resolution options (deferred — changes the ADR-mandated rename protocol and would diverge from the reused audit pattern):**

- Replace temp-file + `rename` with temp-file + `link` (which fails `EEXIST` when the target exists) + `unlink`, making no-overwrite atomic and removing the preflight TOCTOU; update `32-terminal-write-protocol.adr.md` and the `TestRunStateFileSystem` interface, and consider the same change for the audit peer.

**Evidence:** Surfaced by the Codex review (P2, `src/testing/run-state.ts` rename site) on PR #65.
