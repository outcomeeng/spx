# Testing State Storage Architecture

The testing last-run state module defines the immutable `TestRunState` schema (matching `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md`), the per-worktree storage-location helpers keyed on `productDir`, and the read/select surface for terminal runs, with all filesystem dependencies injected. It exports `TestRunState`, the injected `TestRunStateFileSystem` surface (mkdir, writeFile, rename, readFile, readdir), `testingRunsDir(productDir)` resolving `.spx/local/testing/runs/` under the local worktree root, `createTestRunDirectory(productDir, options)`, `readTestingRuns(productDir, options)` partitioning terminal from incomplete runs, and `selectLatestTerminalTestRunForNode(runs, nodeTestPaths)` (the latest terminal run whose outcomes cover the node, by `completedAt`, then `startedAt`, then run-directory name). The atomic write protocol that publishes `state.json` is governed by `spx/41-testing.enabler/43-last-run-evidence.enabler/32-terminal-write-protocol.adr.md`; root-resolution vocabulary follows `spx/16-config.enabler/65-product-directory-api.enabler/product-directory-api.md`.

## Rationale

Dependency injection isolates filesystem operations, so state-loading logic is `l1`-verifiable without mocking; a single typed `TestRunStateFileSystem` keeps all state I/O consistent and prevents ad hoc file operations scattered through the codebase; and the deeply `readonly` `TestRunState` prevents accidental mutation during comparison or reporting. Keying the helpers on `productDir` — the local worktree root — rather than a common-dir root plus a branch slug removes the branch-partitioning concern entirely (one worktree holds one checkout) and removes the cross-domain dependency on the audit branch-slug helper, since no slug participates in the testing path. Direct filesystem calls in handlers (couple state logic to I/O), mock-based testing (obscures the contract, forbidden by `/standardizing-typescript-architecture`), and branch-slug partitioning under a shared root (accumulates stale per-branch directories and couples to the audit slug helper) are rejected.

## Invariants

- All state objects the module exports are deeply `readonly`.
- The storage helpers accept `productDir` and resolve `.spx/local/testing/` beneath it; they derive no branch partition.
- A read returns a `Result`; a malformed `state.json` yields an incomplete classification, never a thrown exception.

## Verification

### Audit

- ALWAYS: every function performing state I/O accepts a `deps: TestRunStateFileSystem` parameter — enables `l1` testing without mocking the filesystem ([audit])
- ALWAYS: `TestRunState` is defined with all fields `readonly` ([audit])
- ALWAYS: validate state against the `TestRunState` schema on read, returning a `Result` with a descriptive error on shape failure ([audit])
- ALWAYS: default `deps` use Node.js `fs.promises`; tests pass controlled implementations ([audit])
- ALWAYS: `TestRunState` records branch name, head SHA, and the four staleness-input digests (config, path-set, content, product inputs); staleness comparison uses only those four digests per `spx/41-testing.enabler/43-last-run-evidence.enabler/43-staleness-comparison.adr.md`, while branch name and head SHA are recorded identity fields reserved for the future checkout-identity guard tracked in [`ISSUES.md`](ISSUES.md), not current staleness inputs ([audit])
- ALWAYS: storage helpers resolve `.spx/local/testing/` under the `productDir` worktree root per `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md` ([audit])
- NEVER: directly `import` Node.js `fs` or `fs.promises` inside module functions — all I/O goes through injected `deps` ([audit])
- NEVER: consume parsed state without schema validation — an unvalidated `JSON.parse()` result is never treated as a `TestRunState` ([audit])
- NEVER: a mutable state object — all state is deeply `readonly` ([audit])
- NEVER: partition testing storage by branch slug or key it on the Git common-dir product root — storage resolves per-worktree under `productDir` ([audit])
