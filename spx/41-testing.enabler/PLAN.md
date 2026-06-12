# Plan: Testing Fixture Coordination

## Purpose

Track remaining fixture coordination after config-backed passing scope and persisted last-run evidence have settled.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns domain descriptors and shared config primitives.
- `spx/41-testing.enabler/testing.md` owns `spx test`, `spx test passing`, runner dispatch, passing-scope policy, and last-run evidence semantics.
- `spx/22-test-environment.enabler/21-callback-scoped-environment.adr.md` owns `withTestEnv` and the existing `withSpecTreeEnv` wrapper.

## Settled

- `spx/41-testing.enabler/32-testing-config.enabler/` owns passing-scope configuration.
- `spx test` and `spx test passing` dispatch discovered spec-tree tests through the language registry.
- Persisted last-run evidence records runner outcomes and staleness inputs under `.spx/worktree/test/runs/`.
- `spx spec status --update` reads last-run evidence and refreshes stale, failing, or absent per-node evidence through the testing registry.

## Current Tranche

- Extend the existing `withSpecTreeEnv` harness in `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/`.
- Keep `withTestEnv` as the cleanup-owning primitive.
- Ensure `withSpecTreeEnv` can materialize both in-memory spec-tree structures and real directory trees from the same fixture description.
- Add options for config file format, passing-scope filters, language-specific test files, and expected last-run state.
- Ensure every helper speaks `productDir`.

## Evidence Required

- `withSpecTreeEnv` tests prove one fixture definition can generate in-memory structures and real directories with `withTempDir` behavior.

## Open Coordination

- Route each new assertion through `spec-tree:testing` and the relevant language testing skill before adding test files.
