# Plan: State

> **Reconcile against `spx/PLAN.md` first.** The corrected model renames "materialization" → `backend`, separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, makes verification the five types that *consume* the journal (never contain it), names `spx verification run` the SPX projection/validation home, requires additive migration (never a wholesale move), defers `.surface`, and builds the changes domain first. This node is the mis-named current home of `persistence`. Where this note predates that model, the root plan governs.

## Harness governance

Governed under the node-local harness-governance pattern: per-module test-harness or generator enablers, spec-auditor and test-evidence-auditor gates including coverage, and literal-collision checks. Coverage survey dispositions for the state+worktree modules:

- **Governed (new nodes):** `testing/harnesses/state/in-memory-file-system.ts` (the `StateStoreFileSystem` double, was 34% consumer-covered) → `spx/18-state.enabler/43-record-store.enabler/21-test-harness.enabler` (it doubles the record-store's FS port); `testing/harnesses/worktree/harness.ts`'s recording `OccupancyFileSystem` double (un-exercised `readFile`/`rm` recording) → `spx/38-worktree.enabler/32-occupancy-store.enabler/21-test-harness.enabler`. Both harness files reach 100% statement coverage.
- **Already governed:** `git-deps.ts` (100%) and `product-root-probe.ts` are governed by `spx/18-state.enabler/15-state-test-harness.enabler`.
- **Fully consumer-covered (no node):** the `state-store`, `worktree`, `main-checkout`, and `git-worktree` generators — every live export is consumer-exercised; dead exports were demoted to private consts.
- **Deferred to batch 7 (infrastructure):** `testing/harnesses/worktree-layout/worktree-layout.ts` (6 consumer nodes across state/worktree/session) and `testing/harnesses/with-git-env.ts` (5 consumers across precommit/verification/worktree) are cross-cutting git/worktree provisioners that belong with the infrastructure batch, not a single domain node.
- **Coverage follow-up:** `product-root-probe.ts`'s invalid-JSON error branch (one un-exercised line) is debt against `15-state-test-harness.enabler`; extend its `[test]` when that node is next edited.
