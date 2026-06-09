# Node Status Architecture

The node-status library is one module at `src/lib/node-status/` whose public surface (`index.ts`) exposes a pure classifier with its classification-facts type and status serializer, a reader, an evidence-provider factory, and the `spx spec status --update` orchestration entry point with the node-outcome resolver type it accepts; the writer is an internal module the orchestration alone reaches, never a public export. The read path joins `spx spec status` through a `SpecTreeEvidenceProvider` the factory builds by closing over `productDir`, resolving each node's directory from the node entry's `id`/`ref.path` to locate its `spx.status.json`, and returning the persisted state when present and `undefined` when absent so the spec-tree library's live `deriveState` governs. The `--update` orchestration obtains each node's pass/fail outcome through a dependency-injected node-outcome resolver supplied at the command edge per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`; the library composes no test runner. Lifecycle values come from `SPEC_TREE_NODE_STATE` and EXCLUDE membership from `createIgnoreSourceReader`; tracked `spx/` paths resolve under `productDir` per `spx/15-worktree-management.pdr.md`. The file contract is governed by `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`.

## Rationale

A single library module mirrors the established `src/lib/spec-tree/` and `src/lib/file-inclusion/` boundaries, so consumers import one surface rather than reaching into file IO, EXCLUDE parsing, or classification internals. Keeping the writer internal — reachable only through the `--update` orchestration — makes the file contract's single-writer rule a structural property of the boundary: there is no exported writer to call from another path. Splitting the concern into a pure classifier plus a thin reader, an internal writer, and a provider factory isolates the only expensive input — per-node outcomes — behind the dependency-injected node-outcome resolver, so the classifier's precedence logic is `l1`-verifiable without running a real suite.

Reusing the spec-tree `SpecTreeEvidenceProvider.stateForNode` hook (which supplies only the node source entry and in-memory evidence, no filesystem path, hence the factory closing over `productDir` and mapping via `id`/`ref.path`) rather than a bespoke read path means a node with a persisted file yields its recorded state and a node without one yields `undefined`, which `deriveState` already handles as live derivation. Reusing `createIgnoreSourceReader` and `SPEC_TREE_NODE_STATE` single-sources EXCLUDE semantics and the lifecycle vocabulary. Placing the module inside `src/lib/spec-tree/` (backend-neutral, owns neither EXCLUDE nor test execution), exposing the writer publicly (defeats the single-writer rule), a bespoke command-side read path (duplicates the live-derivation fallback and couples the command to file layout), and a node-status-local EXCLUDE parser (drifts from the single EXCLUDE surface) are rejected.

## Invariants

- Classification is total and deterministic: every combination of test-presence, EXCLUDE-membership, and outcome facts maps to exactly one `SPEC_TREE_NODE_STATE` value, and identical facts always map to the same value.
- Round-trip fidelity: reading a node directory the writer has populated yields the exact state the writer recorded, for every lifecycle value.
- Read purity: resolving a node's persisted state performs no filesystem writes and runs no tests.

## Verification

### Audit

- ALWAYS: expose the classifier with its classification-facts type and status serializer, the reader, the evidence-provider factory, and the `spx spec status --update` orchestration with its node-outcome resolver type through a single `src/lib/node-status/index.ts` public surface — consumers import the surface, not internals ([audit])
- ALWAYS: keep the writer an internal module the `--update` orchestration alone reaches ([audit])
- ALWAYS: express lifecycle values through `SPEC_TREE_NODE_STATE` — node-status declares no parallel state strings ([audit])
- ALWAYS: resolve EXCLUDE membership through `createIgnoreSourceReader` ([audit])
- ALWAYS: build the evidence provider in a factory that closes over `productDir` and resolves each node's directory from the node entry's `id`/`ref.path`, passing the provider to `readSpecTree` and returning the persisted state when present and `undefined` when absent ([audit])
- ALWAYS: accept the per-node outcome through a dependency-injected node-outcome resolver parameter — enables `l1` verification of classification without executing a real suite ([audit])
- ALWAYS: accept `productDir` from the caller and resolve tracked `spx/` paths under it per `spx/15-worktree-management.pdr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or any module-interception mechanism for node-status dependencies — classification, reader, and writer are exercised against real temp-directory fixtures ([audit])
- NEVER: export the writer from the public surface or invoke it outside the `--update` orchestration ([audit])
- NEVER: re-run tests or write any file on the read path — reading persisted state is pure ([audit])
- NEVER: declare the four lifecycle string literals anywhere outside `SPEC_TREE_NODE_STATE` ([audit])
- NEVER: read `spx/EXCLUDE` through a node-status-local parser instead of `createIgnoreSourceReader` ([audit])
- NEVER: the node-status library composes a language-specific test runner — outcomes arrive through the injected resolver ([audit])
