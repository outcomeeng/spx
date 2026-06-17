# Open Issues

## Claim temp path is shared by every writer for one worktree

`src/domains/worktree/occupancy-store.ts` writes every claim for a given worktree through the same temporary path, `<name>.claim.tmp`, before renaming it to `<name>.claim`. The observed hook failure reports `ENOENT` while renaming `.spx/worktrees/spx-b.claim.tmp` to `.spx/worktrees/spx-b.claim`, which matches one writer losing the shared temp file before its rename runs.

**Evidence:** `writeClaim` composes `const tempPath = `${claimPath}${OCCUPANCY_CLAIM.TEMP_EXTENSION}``, so the temp path is deterministic per worktree name. The plugin hook invokes `spx worktree claim --session-id <session-id>` from both `SessionStart` and `PreToolUse` repair paths, so repeated claim attempts for the same worktree can overlap even when there is only one agent session.

**Impact:** Claim repair can fail with `worktree occupancy claim write failed: ENOENT`, leaving the worktree stale or unclaimed. This is a robustness gap in the occupancy store, separate from the hook/runtime controlling-process contract that makes claim attempts fail for Codex.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Give each claim write a writer-unique temp path, keep the final claim path stable, and cover the behavior with occupancy-store tests that exercise repeated or overlapping writes without sharing the same temp filename.
