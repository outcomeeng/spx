# TypeScript Provider Shape

The TypeScript source-graph provider ships as two descriptors under `src/outcomeeng/spec-tree/graph/source/providers/typescript/` — a coverage descriptor mapping test-attributed Vitest coverage payloads to coverage facts, and a module-graph descriptor mapping TypeScript module-graph payloads to reachability facts — each exported from its own module and reached by the provider registry through an explicit import statement, per [`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/21-kernel-host-split.adr.md`](../21-kernel-host-split.adr.md). Provider identities and payload vocabulary are source-owned `as const` declarations under the same path, and reachability facts derive by transitive closure from each supplied test entry over the supplied module edges, with fact output ordered by code units.

## Rationale

Two descriptors keep each tool's payload contract and provenance separate: a fact's `provider` names the one tool that emitted it, and a later slice that binds the real Vitest coverage reporter or the real compiler-API module walker replaces one payload contract without touching the other. A single descriptor emitting both kinds is rejected because one provider identity cannot attribute two tools' facts. The provider owns the reachability closure because module-graph tools emit file-to-file edges while the fact contract per [`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/11-source-provider-boundary.adr.md`](../11-source-provider-boundary.adr.md) relates a test entry to each source it reaches — closing the edge relation is pure data transformation, not source parsing. Code-unit ordering keeps emitted fact sequences identical across hosts independent of locale collation.

## Invariants

- Each descriptor's fact output is a deterministic function of its typed payload.
- Every provider identity string has exactly one owning `as const` declaration under `src/outcomeeng/spec-tree/graph/source/providers/typescript/`.
- Every fact either descriptor emits carries the `typescript` language in its provenance.

## Verification

### Audit

- ALWAYS: the coverage and module-graph descriptors live in separate modules under `src/outcomeeng/spec-tree/graph/source/providers/typescript/`, each exporting one typed descriptor that the registry imports explicitly ([audit])
- ALWAYS: provider identities and payload field vocabulary are source-owned `as const` declarations that tests and generators import from the owning module ([audit])
- ALWAYS: coverage and module-graph payloads enter each descriptor as typed parameters — no module under `src/outcomeeng/spec-tree/graph/source/providers/typescript/` imports `node:fs`, `node:child_process`, process APIs, or tool-invocation libraries ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or module interception in provider tests — controlled payloads enter through the public parameter surface ([audit])
