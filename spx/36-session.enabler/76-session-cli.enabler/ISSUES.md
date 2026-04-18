# Open Issues

## Variadic ID support missing from pickup and release

The spec declares that `archive`, `delete`, `show`, `pickup`, and `release` all accept multiple session IDs in a single invocation. The current implementation supports variadic IDs only for `archive`, `delete`, and `show` (via `processBatch` from `src/session/batch.ts`).

**Affected commands:**

- `src/commands/session/pickup.ts` — `PickupOptions.sessionId: string` (single)
- `src/commands/session/release.ts` — `ReleaseOptions.sessionId: string` (single)

**Resolution:** Extend `pickup` and `release` to accept `sessionIds: string[]` and consume `processBatch()` from `src/session/batch.ts`. Update Commander.js bindings to use variadic arg syntax. Assertions in `session-cli.md` scenarios reference `pickup` and `release` with multiple IDs — tests will fail once implementation is attempted against the new spec.

**Blocking:** None. Phase 2c-i rearchitecture is complete without this; the gap is spec-vs-code, not a blocker for Phase 2c-ii (legacy deletion).
