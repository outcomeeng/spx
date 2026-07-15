# PLAN

> Reconcile against `spx/PLAN.md` and `spx/25-outcomeeng.enabler/31-spec-tree.enabler/PLAN.md` first. This note coordinates the graph aggregate.

## Graph Decomposition Intent

`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler` provides graph semantics for the artifacts Outcome Engineering represents through Spec Tree.

The graph slices are ordered by truth flow:

| Slice               | Dependency role  | Reason                                                                                                     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `21-spec.enabler`   | Provider         | The spec graph is durable product truth: nodes, decisions, assertions, and declared evidence links.        |
| `32-test.enabler`   | Consumer of spec | Tests derive their meaning from spec assertions and evidence links.                                        |
| `43-source.enabler` | Consumer of test | Source ownership is established from spec-linked tests plus language/provider facts.                       |
| `change.enabler`    | Deferred         | Change graph placement needs a later decomposition against `spx/25-outcomeeng.enabler/31-changes.enabler`. |

## Shared Concerns

The graph aggregate should own shared graph vocabulary and provider rules that more than one slice consumes:

- artifact identity and graph edge vocabulary
- product-root-relative path identity
- evidence confidence and provenance labels
- provider fact normalization
- garbage-collection candidate vocabulary

Do not parse implementation source files in SPX. The tree-provider boundary supplies declared evidence-link facts to the spec graph boundary; the test graph consumes test evidence-link facts, and the source graph consumes provider outputs for source, coverage, module, or import facts.

## Implementation Boundary

The source graph implementation is shaped as Outcome Engineering graph core, not as a command-domain library, under a package boundary that can later move behind a Rust implementation without changing the graph contract:

```text
src/outcomeeng/spec-tree/graph/source/
```

The TypeScript implementation is a host binding for the graph kernel: typed contracts, normalization, and provider descriptor orchestration. Keep command handlers and CLI adapters outside this path.

## Next Slices

The `43-source.enabler` kernel is implemented and passing: ownership classification, provider descriptor contracts, canonical path identity, and garbage-collection candidate derivation, verified against injected provider facts. The next actionable work is the language provider slices under `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler` — see that node's `PLAN.md` for the provider plan and ordering.

The reserved `21-spec.enabler` and `32-test.enabler` slices remain spec-only concepts; materialize their contracts when a consumer needs them. The change graph stays deferred pending decomposition against `spx/25-outcomeeng.enabler/31-changes.enabler`.
