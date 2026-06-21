# Open Issues

## The recording-FS test borrows the state-store encoding constant

`tests/test-harness.scenario.l1.test.ts` calls `recording.readFile(target, STATE_STORE_TEXT_ENCODING)` with `STATE_STORE_TEXT_ENCODING` imported from `@/lib/state-store`, because the `OccupancyFileSystem.readFile` signature types its encoding as `"utf8"` and the worktree domain exports no encoding constant of its own.

**Evidence:** `src/domains/worktree/occupancy-store.ts` inlines `"utf8"` both in the `OccupancyFileSystem.readFile` signature and at the claim-read call site; the test reaches into the state-store domain for a source-owned `"utf8"` value rather than a worktree-owned one.

**Impact:** A cosmetic cross-domain coupling — the test depends on a state-store production export for a worktree-domain test. No behavior is affected, and the test-evidence audit approved it as a non-blocking observation.

**Resolution:** Introduce a worktree-owned `OCCUPANCY_FS_TEXT_ENCODING` constant on the occupancy-store domain, use it at the claim-read call site, and re-point this test at it so the import no longer crosses the domain boundary. Fold this into the next change that already edits `src/domains/worktree/occupancy-store.ts`, so the edit does not drag that file's unrelated pre-existing lint debt (e.g. the `typescript:S6551` finding) into a harness-governance change.
