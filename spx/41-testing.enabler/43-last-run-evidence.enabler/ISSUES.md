# Issues: Last-Run Evidence

## FOLLOW-UP: testing → audit cross-domain helper coupling

`src/testing/run-state.ts` reuses `formatAuditRunTimestamp` and `slugAuditBranchIdentity` from `src/domains/audit/run-state.ts`. The reuse is mandated by [`11-last-run-directory.adr.md`](11-last-run-directory.adr.md) ("Reuse the audit branch slug implementation for testing branch slugs"; "Name run directories with the audit timestamp-plus-run-id shape") and acknowledged in [`21-testing-state-storage.adr.md`](21-testing-state-storage.adr.md).

**Impact:** No decision declares those audit helpers as a stable, public cross-domain surface. A future refactor of the audit domain could change or move them and break testing state with no spec-level signal. The testing → audit dependency direction is an implicit architectural coupling.

**Resolution options (deferred — the fix touches the audit domain, outside this node's diff):**

- Declare the slug and run-directory helpers as a public, stable surface in the audit domain's decision record, with a compliance rule that testing depends on it; or
- Extract the shared slug and timestamp helpers into a neutral utility module that both `src/domains/audit/` and `src/testing/` import, and update both decision records to reference it.

**Evidence:** Surfaced by the local changes review (finding F-004) on `work/typescript-testing-runner`.
