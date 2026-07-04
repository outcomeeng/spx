# PLAN

> Reconcile against `spx/PLAN.md` and `spx/25-outcomeeng.enabler/31-spec-tree.enabler/PLAN.md` first. This note coordinates the graph aggregate after the first specs are authored.

## Graph Decomposition Intent

`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler` provides graph semantics for the artifacts Outcome Engineering represents through Spec Tree.

The graph slices are ordered by truth flow:

| Slice               | Dependency role  | Reason                                                                                                     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `21-spec.enabler`   | Provider         | The spec graph is durable product truth: nodes, decisions, assertions, and declared evidence links.        |
| `32-test.enabler`   | Consumer of spec | Tests derive their meaning from spec assertions and evidence links.                                        |
| `43-source.enabler` | Consumer of test | Source ownership is established from spec-linked tests plus language/provider facts.                       |
| `change.enabler`    | Deferred         | Change graph placement needs a later decomposition against `spx/25-outcomeeng.enabler/31-changes.enabler`. |

`43-source.enabler` is the first implementation slice. The lower-index `spec` and `test` graph slices are authored as graph concepts because the source graph depends on their contracts.

## Shared Concerns

The graph aggregate should own shared graph vocabulary and provider rules that more than one slice consumes:

- artifact identity and graph edge vocabulary
- product-root-relative path identity
- evidence confidence and provenance labels
- provider fact normalization
- garbage-collection candidate vocabulary

Do not parse implementation source files in SPX. The tree-provider boundary supplies declared evidence-link facts to the spec graph boundary; the test graph consumes test evidence-link facts, and the source graph consumes provider outputs for source, coverage, module, or import facts.

## Implementation Boundary

The source graph implementation should be shaped as Outcome Engineering graph core, not as a command-domain library. Use a package boundary that can later move behind a Rust implementation without changing the graph contract:

```text
src/outcomeeng/spec-tree/graph/source/
```

The first TypeScript implementation is a host binding for the graph kernel: typed contracts, normalization, and provider descriptor orchestration. Keep command handlers and CLI adapters outside this path. A later Rust module should be able to own the same graph-kernel contract and expose the same normalized fact vocabulary to the TypeScript host.

## First Slice

Proceed with:

```text
spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler
```

The source slice should author enough parent graph truth to make its dependency on spec and test graph concepts explicit, then implement the first provider-backed source ownership report.
