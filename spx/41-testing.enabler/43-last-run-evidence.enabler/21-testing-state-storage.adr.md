# Testing State Storage Architecture

## Purpose

This decision governs the testing last-run state schema, its branch-scoped storage location under `.spx/testing/{branch-slug}/runs/{run-directory}/state.json`, and the read/select surface that consumes it, with interfaces designed for dependency injection and testable isolation. The atomic write protocol that publishes `state.json` is governed by [`spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md).

## Context

**Business impact:** Fast status commands need to read cached test observations without re-running test suites. Persisted state must be branch-scoped so one worktree branch never supplies status evidence for another.

**Technical constraints:** Testing state is gitignored local state stored at `.spx/` (Git common-dir product root per [`spx/15-worktree-resolution.pdr.md`](../../15-worktree-resolution.pdr.md)). The directory structure and schema are governed by [`spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`](11-last-run-directory.adr.md). State persistence must support isolated testing through dependency injection.

## Decision

Define the immutable `TestRunState` schema, the branch-scoped storage-location helpers, and the read/select surface for terminal runs, with filesystem dependencies injected. The terminal-write protocol that publishes a single run's `state.json` is deferred to [`spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md); this decision owns the shape, location, and the lookup that consumes written state.

The module exports:

1. `TestRunState` interface (immutable, readonly) matching the schema from [`spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`](11-last-run-directory.adr.md)
2. `TestRunStateFileSystem` — the injected filesystem dependency surface (mkdir, writeFile, rename, readFile, readdir)
3. `testingBranchDir` / `testingRunsDir` — branch-scoped storage-location helpers under `.spx/testing/{branch-slug}/runs/`
4. `createTestRunDirectory(productDir, branchSlug, options)` — allocates a uniquely named run directory for a new run
5. `readTestingBranchRuns(productDir, branchSlug, options)` — reads a branch's runs, partitioning terminal from incomplete (the incomplete taxonomy is owned by [`spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md))
6. `selectLatestTerminalTestRun(runs)` — selects the latest terminal run by `completedAt`, then `startedAt`, then run-directory name

The branch slug and run-directory naming reuse the audit implementations per [`spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`](11-last-run-directory.adr.md).

## Rationale

Dependency injection isolates filesystem operations, enabling `l1` testing of state-loading logic without mocking. A single typed interface for all state operations ensures consistency and prevents ad hoc file operations scattered through the codebase. The immutable `TestRunState` interface prevents accidental state mutations during comparison or reporting.

Alternatives considered:

- **Direct filesystem calls in command handlers**: Couples state logic to I/O, prevents isolated testing. Rejected.
- **Mock-based testing of real filesystem calls**: Requires mocking framework, obscures contract. Rejected per `/standardizing-typescript-architecture`.
- **Separate load/store/query functions without shared interface**: Duplicates contracts, harder to maintain. Rejected.

## Trade-offs accepted

| Trade-off                                            | Mitigation / reasoning                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema and write protocol live in separate decisions | The schema and lookup defined here are stable; the write protocol in [`spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`](32-terminal-write-protocol.adr.md) carries its own atomicity concerns, so it owns its own decision |
| Branch slug and run directory reuse audit helpers    | [`spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`](11-last-run-directory.adr.md) mandates the reuse; one slug implementation serves both domains                                                                                |
| State immutability enforced by `readonly` only       | Tests verify mutations don't happen; readonly prevents accidental writes, not hostile misuse                                                                                                                                                                      |

## Invariants

- All state objects exported from the module are `readonly` and deeply immutable (no mutable nested structures)
- The module accepts the branch slug and run directory as parameters; it reuses the audit helpers to derive them rather than defining its own
- Default `deps` implementations use Node.js built-ins (`fs.promises`); tests inject controlled implementations
- A read returns a `Result`; a malformed `state.json` yields an incomplete classification, never a thrown exception

## Compliance

### Recognized by

Observable `TestRunStateFileSystem` parameter in all functions that perform state I/O. State files are validated against the `TestRunState` schema before use, returning a `Result`.

### MUST

- All functions performing state I/O accept a `deps: TestRunStateFileSystem` parameter — enables `l1` testing of state logic without mocking the filesystem ([review])
- `TestRunState` is defined with all fields as `readonly` — prevents accidental mutations ([review])
- State is validated against the `TestRunState` schema on read, returning a `Result` with a descriptive error on shape failure — matches the audit run-state validation pattern ([review])
- Default `deps` implementations use Node.js `fs.promises`; tests pass controlled implementations — no mocking required ([review])
- `TestRunState` records branch name, branch slug, head SHA, and all staleness inputs (config digest, path-set digest, content digest, product input digests) — enables staleness comparison per [`spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`](43-staleness-comparison.adr.md) ([review])
- `createTestRunDirectory` and `readTestingBranchRuns` validate the branch slug against the normalized slug format before any filesystem operation, returning `INVALID_BRANCH_SLUG` for an unnormalized slug — an unnormalized slug never reaches the filesystem, mirroring the audit branch-slug guard ([review])

### NEVER

- Direct `import` of Node.js `fs` or `fs.promises` inside module functions — all I/O goes through the injected `deps` ([review])
- Consume parsed state without schema validation — an unvalidated `JSON.parse()` result is never treated as a `TestRunState` ([review])
- Mutable state objects — all state is deeply `readonly` ([review])
