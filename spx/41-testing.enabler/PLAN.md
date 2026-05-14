# Plan: Testing Config And Status Evidence

## Purpose

Move spec-tree passing-scope behavior to `spx.config.{toml,json,yaml}` and prepare persisted last-run evidence so status commands can report fast observations without re-running all tests.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns domain descriptors and shared config primitives.
- `spx/41-testing.enabler/testing.md` owns `spx test`, `spx test passing`, runner dispatch, passing-scope policy, and last-run evidence semantics.
- `spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md` owns `withTestEnv` and the existing `withSpecTreeEnv` wrapper.

## Current Tranche

1. Add a testing config descriptor.
   - The first section owns passing scope only.
   - Use the shared path-filter primitive from `spx/16-config.enabler/`.
   - Keep normal `spx test` discovery independent from passing-scope filters.

2. Extend the existing `withSpecTreeEnv` harness.
   - Keep `withTestEnv` as the cleanup-owning primitive.
   - Ensure `withSpecTreeEnv` can materialize both in-memory spec-tree structures and real directory trees from the same fixture description.
   - Add options for config file format, passing-scope filters, language-specific test files, and expected last-run state.
   - Ensure every helper speaks `productDir`.

3. Persist last-run evidence.
   - Store runner outcomes, timestamps, discovered test inputs, config hash or comparable staleness input, and result summary.
   - Mark cached evidence stale when the resolved testing config digest or discovered test file path set differs from recorded values.
   - Compute discovery once per status/test command and reuse the discovered test file path set for both staleness comparison and runner dispatch.
   - Treat persisted state as an evidence cache only.
   - Status commands may read state for speed, but config remains the source for passing-scope policy.

## Evidence Required

- Testing descriptor tests cover defaults, valid passing-scope filters, invalid filters, and descriptor isolation from validation config.
- `spx test passing` scenario tests prove filtered nodes are skipped before runner invocation.
- `spx test` scenario tests prove filtered nodes still run when `passing` is absent.
- `withSpecTreeEnv` tests prove one fixture definition can generate in-memory structures and real directories with `withTempDir` behavior.
- Last-run state tests prove status reads cached observations without invoking runners and marks stale evidence when the resolved testing config descriptor digest changes.
- Testing digest tests prove the digest is computed from config-owned canonical descriptor JSON for the resolved testing config descriptor section after defaults are applied.
- Last-run state tests prove status marks cached evidence stale when the discovered test file path set changes.
- Performance regression tests or instrumentation prove staleness comparison reuses the discovery result instead of walking the spec tree twice in one command.

## Open Coordination

- Route each new assertion through `spec-tree:testing` and the relevant language testing skill before adding test files.
- Delete `spx/EXCLUDE`-based test fixtures after config-backed passing scope passes.
