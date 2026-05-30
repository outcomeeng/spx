# Node Status Architecture

## Purpose

This decision governs the module boundary, decomposition, and dependency-injection shape of the node-status library — the classifier, the reader, the evidence-provider factory, and the internal writer confined to the `spx spec status --update` orchestration — that realize the `spx.status.json` contract and feed `spx spec status`.

## Context

**Business impact:** `spx spec status` reports each node's lifecycle state, and `spx spec status --update` records it. Both consume one library whose boundary keeps file persistence, EXCLUDE membership, and test-outcome classification separable so each is verifiable in isolation.

**Technical constraints:** The spec-tree library exposes a `SpecTreeEvidenceProvider` whose `stateForNode(node, evidence)` hook overrides the live `deriveState` per node — receiving the node source entry (carrying `id` and `ref.path`) and the in-memory evidence entries, but no filesystem path — a `SpecTreeSource` that yields node and evidence entries, and the `SPEC_TREE_NODE_STATE` union as the single source of the four lifecycle values. The file-inclusion library exposes `createIgnoreSourceReader`, which reads `spx/EXCLUDE` and answers membership. Worktree-local root resolution for tracked `spx/` files is governed by `spx/15-worktree-resolution.pdr.md`. The file contract — co-located `spx.status.json`, JSON-only, single writer, absence-routes-to-live-derivation — is governed by `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`.

## Decision

The node-status library is one module at `src/lib/node-status/` whose public surface (`index.ts`) exposes a pure classifier, a reader, an evidence-provider factory, and the `spx spec status --update` orchestration entry point — the writer is an internal module the orchestration alone reaches, never a public export — and the read path joins `spx spec status` through an evidence-provider that the factory builds by closing over `productDir`, resolving each node's directory from the node entry's `id`/`ref.path` to locate its `spx.status.json`, returning the persisted state when present and `undefined` when absent so live derivation governs.

## Rationale

A single library module mirrors the established `src/lib/spec-tree/` and `src/lib/file-inclusion/` boundaries, so consumers import one surface rather than reaching into file IO, EXCLUDE parsing, or classification internals. Keeping the writer internal — reachable only through the `--update` orchestration the surface exposes — makes the file contract's single-writer rule a structural property of the module boundary rather than a convention a caller could bypass: there is no exported writer to call from another path. Splitting the concern into a pure classifier plus a thin reader, an internal writer, and a provider factory isolates the only expensive input — per-node test outcomes — behind a dependency-injected runner, so the classifier's precedence logic is verifiable at `l1` without running a real suite.

The `SpecTreeEvidenceProvider.stateForNode` hook is the spec-tree library's per-node override point, but it receives only the node source entry and in-memory evidence — no filesystem context — so the evidence-provider factory closes over `productDir` and maps each node to its directory through the node entry's `id`/`ref.path` to read that node's `spx.status.json`. Reusing this hook rather than forking a parallel read path means a node with a persisted file yields its recorded state and a node without one yields `undefined`, which the library's `deriveState` already handles as live derivation. Reusing `createIgnoreSourceReader` for EXCLUDE membership and `SPEC_TREE_NODE_STATE` for the lifecycle values keeps EXCLUDE semantics and state vocabulary single-sourced.

Alternatives considered and rejected:

- Placing the implementation inside `src/lib/spec-tree/` — rejected: the spec-tree library is backend-neutral and owns neither EXCLUDE membership nor test execution, both of which node-status requires.
- Exposing the writer as a public export of the surface — rejected: a public writer lets any caller write `spx.status.json`, which the governing PDR's single-writer rule forbids; confining the writer behind the `--update` orchestration makes the rule structural.
- A bespoke read path in the status command that reads each `spx.status.json` directly — rejected: it duplicates the live-derivation fallback the spec-tree library's evidence-provider hook already expresses, and couples the command to file layout.
- Re-deriving EXCLUDE membership from a node-status-local parser — rejected: `createIgnoreSourceReader` is the single EXCLUDE surface; a parallel parser would drift from its validation and matching rules.

## Trade-offs accepted

| Trade-off                                                                                | Mitigation / reasoning                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new top-level library module rather than folding into spec-tree                        | Node-status depends on EXCLUDE and test execution, which the backend-neutral spec-tree library must not own                                                 |
| Classification depends on an injected test-outcome runner, not a pure read               | The injection is the boundary that makes the precedence logic `l1`-verifiable; the real runner is supplied at the command edge                              |
| The `--update` path re-runs node test suites to classify                                 | Recording state is an explicit, infrequent operation; the read path never runs tests, so `spx spec status` stays fast                                       |
| The evidence-provider factory must reconstruct each node's directory from the node entry | The `stateForNode` hook supplies no path; closing over `productDir` and mapping via `id`/`ref.path` is the only read-path seam the spec-tree library offers |

## Invariants

- Classification is total and deterministic: every combination of test-presence, EXCLUDE-membership, and test-outcome facts maps to exactly one `SPEC_TREE_NODE_STATE` value, and identical facts always map to the same value.
- Round-trip fidelity: reading a node directory the writer has populated yields the exact state the writer recorded, for every one of the four lifecycle values.
- Read purity: resolving a node's persisted state performs no filesystem writes and never re-runs tests.

## Compliance

### Recognized by

`src/lib/node-status/index.ts` exports the classifier, the reader, the evidence-provider factory, and the `spx spec status --update` orchestration entry point — and no free-standing writer; `spx spec status` reads persisted state through a `SpecTreeEvidenceProvider` the factory builds over `productDir` and injects into `readSpecTree`; and `spx.status.json` files are written only within the `--update` orchestration.

### MUST

- Expose the node-status classifier, reader, evidence-provider factory, and `spx spec status --update` orchestration entry point through a single `src/lib/node-status/index.ts` public surface — consumers import the surface, not internals ([review])
- Keep the writer an internal module the `spx spec status --update` orchestration alone reaches — it is never part of the public surface ([review])
- Express the lifecycle values through `SPEC_TREE_NODE_STATE` from the spec-tree library — node-status declares no parallel state strings ([review])
- Resolve EXCLUDE membership through `createIgnoreSourceReader` ([review])
- Build the evidence provider in a factory that closes over `productDir` and resolves each node's directory from the node entry's `id`/`ref.path`, since `stateForNode` receives no filesystem path; pass the provider to `readSpecTree`, returning the persisted state when the file is present and `undefined` when it is absent ([review])
- Accept the per-node test outcome through a dependency-injected runner parameter — enables `l1` verification of classification without executing a real suite ([review])
- Accept `productDir` from the caller and resolve tracked `spx/` paths under it per `spx/15-worktree-resolution.pdr.md` ([review])

### NEVER

- `vi.mock()`, `jest.mock()`, or any module-interception mechanism for node-status dependencies — classification, reader, and writer are exercised against real temp-directory fixtures ([review])
- Export the writer from the public surface or invoke it outside the `spx spec status --update` orchestration ([review])
- Re-run tests or write any file on the read path — reading persisted state is pure ([review])
- Declare the four lifecycle string literals anywhere outside `SPEC_TREE_NODE_STATE` ([review])
- Read `spx/EXCLUDE` through a node-status-local parser instead of `createIgnoreSourceReader` ([review])
