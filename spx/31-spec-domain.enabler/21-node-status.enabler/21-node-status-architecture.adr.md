# Node Status Architecture

The node-status library is one module at `src/lib/node-status/` whose public surface (`index.ts`) exposes a pure status-file parser, a lifecycle classifier over spec structure plus verification outcomes, a reader, an evidence-provider factory, and the `spx spec status --update` orchestration entry point with the verification resolver type it accepts; the writer is an internal module the orchestration alone reaches, never a public export. The read path joins `spx spec status` through a `SpecTreeEvidenceProvider` the factory builds by closing over `productDir`, resolving each node's directory from the node entry's `id`/`ref.path` to locate its `spx.status.json`, and returning the lifecycle state derived from persisted verification outcomes when present and `undefined` when absent so the spec-tree library's live `deriveState` governs. The `--update` orchestration obtains per-node verification outcomes through dependency-injected resolvers supplied at the command edge per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`; the library composes no test runner, lifecycle values come from `SPEC_TREE_NODE_STATE`, EXCLUDE membership comes from `createIgnoreSourceReader`, tracked `spx/` paths resolve under `productDir` per `spx/15-worktree-management.pdr.md`, and the file contract is governed by `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`.

## Rationale

A single library module mirrors the established `src/lib/spec-tree/` and `src/lib/file-inclusion/` boundaries, so consumers import one surface rather than reaching into file IO, EXCLUDE parsing, verification outcome parsing, or classification internals. Keeping the writer internal — reachable only through the `--update` orchestration — makes the file contract's single-writer rule a structural property of the boundary: there is no exported writer to call from another path. Splitting the concern into a status-file parser, a pure classifier, a thin reader, an internal writer, and a provider factory isolates the expensive inputs — test, eval, and audit execution outcomes — behind dependency-injected resolvers, so lifecycle derivation remains `l1`-verifiable without running a real suite.

Reusing the spec-tree `SpecTreeEvidenceProvider.stateForNode` hook (which supplies only the node source entry and in-memory evidence, no filesystem path, hence the factory closing over `productDir` and mapping via `id`/`ref.path`) means a node with a persisted file yields its derived recorded state and a node without one yields `undefined`, which `deriveState` already handles as live derivation. Reusing `createIgnoreSourceReader` and `SPEC_TREE_NODE_STATE` single-sources EXCLUDE semantics and the lifecycle vocabulary. A status file containing top-level lifecycle state alone is rejected because it loses which verification references produced the result. Placing the module inside `src/lib/spec-tree/` (backend-neutral, owns neither EXCLUDE nor test execution), exposing the writer publicly (defeats the single-writer rule), a bespoke command-side read path (duplicates the live-derivation fallback and couples the command to file layout), and a node-status-local EXCLUDE parser (drifts from the single EXCLUDE surface) are rejected.

## Invariants

- Classification is total and deterministic: every combination of spec structure, EXCLUDE-membership, and persisted verification outcomes maps to exactly one `SPEC_TREE_NODE_STATE` value, and identical inputs always map to the same value.
- Round-trip fidelity: reading a node directory the writer has populated yields the same verification outcomes and derived lifecycle state the writer recorded.
- Read purity: resolving a node's persisted state performs no filesystem writes and runs no tests.

## Verification

### Testing

- ALWAYS: parsing `spx.status.json` accepts only schema version 1 files whose verification mechanisms, overall values, evidence references, and per-reference outcomes conform to `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([conformance])
- ALWAYS: lifecycle classification maps persisted verification outcomes to `SPEC_TREE_NODE_STATE` values deterministically for all valid mechanism rollups ([mapping])
- ALWAYS: the read path returns `undefined` when `spx.status.json` is absent and performs no writes or verification execution when it is present ([compliance])

### Audit

- ALWAYS: expose the status-file parser, lifecycle classifier, reader, evidence-provider factory, and `spx spec status --update` orchestration with its verification resolver type through a single `src/lib/node-status/index.ts` public surface — consumers import the surface, not internals ([audit])
- ALWAYS: keep the writer an internal module the `--update` orchestration alone reaches ([audit])
- ALWAYS: express lifecycle values through `SPEC_TREE_NODE_STATE` — node-status declares no parallel state strings ([audit])
- ALWAYS: resolve EXCLUDE membership through `createIgnoreSourceReader` ([audit])
- ALWAYS: build the evidence provider in a factory that closes over `productDir` and resolves each node's directory from the node entry's `id`/`ref.path`, passing the provider to `readSpecTree` and returning the derived persisted state when present and `undefined` when absent ([audit])
- ALWAYS: accept per-node verification outcomes through dependency-injected resolver parameters — enables `l1` verification of classification without executing a real suite ([audit])
- ALWAYS: accept `productDir` from the caller and resolve tracked `spx/` paths under it per `spx/15-worktree-management.pdr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or any module-interception mechanism for node-status dependencies — classification, reader, and writer are exercised against real temp-directory fixtures ([audit])
- NEVER: export the writer from the public surface or invoke it outside the `--update` orchestration ([audit])
- NEVER: run tests, evals, audits, or write any file on the read path — reading persisted state is pure ([audit])
- NEVER: declare the four lifecycle string literals anywhere outside `SPEC_TREE_NODE_STATE` ([audit])
- NEVER: read `spx/EXCLUDE` through a node-status-local parser instead of `createIgnoreSourceReader` ([audit])
- NEVER: the node-status library composes a language-specific test runner — outcomes arrive through the injected resolver ([audit])
