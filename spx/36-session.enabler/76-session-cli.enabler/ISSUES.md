# Open Issues

## Variadic ID support missing from pickup and release

The spec declares that `archive`, `delete`, `show`, `pickup`, and `release` all accept multiple session IDs in a single invocation. The current implementation supports variadic IDs only for `archive`, `delete`, and `show` (via `processBatch` from `src/session/batch.ts`).

**Affected commands:**

- `src/commands/session/pickup.ts` — `PickupOptions.sessionId: string` (single)
- `src/commands/session/release.ts` — `ReleaseOptions.sessionId: string` (single)

**Resolution:** Extend `pickup` and `release` to accept `sessionIds: string[]` and consume `processBatch()` from `src/session/batch.ts`. Update Commander.js bindings to use variadic arg syntax. Assertions in `session-cli.md` scenarios reference `pickup` and `release` with multiple IDs — tests will fail once implementation is attempted against the new spec.

**Blocking:** None. Phase 2c-i rearchitecture is complete without this; the gap is spec-vs-code, not a blocker for Phase 2c-ii (legacy deletion).

## Detached-HEAD scenario has no CLI-level test coverage

`spx/36-session.enabler/76-session-cli.enabler/session-cli.md` declares a scenario for `SessionDetachedHeadError` propagation through the CLI binding and links it to `tests/session-cli.scenario.l2.test.ts`. Neither `session-cli.scenario.l2.test.ts` nor `session-cli.compliance.l2.test.ts` exercises the detached-HEAD path through `node bin/spx.js` — `grep -rn "SessionDetachedHeadError\|HEAD is detached" tests/` returns nothing.

**Evidence:** The scenario assertion in `session-cli.md` lines 23-24 is unbacked at the CLI level; `SessionDetachedHeadError` raises through the domain layer but no compliance/scenario test asserts the exit-code-1 + stderr-naming behavior through the Commander binding.

**Impact:** The compliance ALWAYS rule that names `SessionDetachedHeadError` in the diagnostic-line set has no concrete fixture; a regression that swallows the error name or routes the error through a different exit code would land silently.

**Resolution:** Add a `runSpx` case to `session-cli.compliance.l2.test.ts` (or a sibling test file) that creates a temp git repo, detaches HEAD via `git checkout <sha>`, pipes a valid JSON handoff header, and asserts `exitCode === 1` with `"SessionDetachedHeadError"` in stderr. Then update the scenario link to point at the file that carries the new test.
