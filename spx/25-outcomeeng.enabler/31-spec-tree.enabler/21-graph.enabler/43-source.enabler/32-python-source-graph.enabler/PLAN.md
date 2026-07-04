# PLAN

> Reconcile against `spx/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/PLAN.md`, and `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/PLAN.md` first. This is a coordination placeholder; `/author` creates the spec before implementation.

## Provider Boundary

The Python provider supplies normalized implementation-source facts to the source graph provider contract. It does not decide source ownership and does not parse Spec Tree Markdown.

Use established Python tooling:

- coverage.py for executed coverage facts.
- grimp for import graph facts.

The provider exports facts into the shared source graph vocabulary:

```text
language: python
provider: coverage.py | grimp
artifact: product-root-relative source path
fact: covered | reachable | imports
provenance: tool, version/config digest when available, command or descriptor id
```

## Implementation Placement

Keep the first host-side adapter under:

```text
src/outcomeeng/spec-tree/graph/source/providers/python/
```

This path is a host adapter around the graph kernel. Avoid coupling the provider contract to a TypeScript command-domain shape so a future Rust module can own the graph kernel while the TypeScript host invokes Python tooling.

## First Slice

1. Author this node's spec after the shared `21-provider-contract.enabler` and `21-provider-fact-normalization.enabler` specs exist.
2. Add Python provider descriptors only after the shared contract can represent coverage and import facts without language-specific vocabulary.
3. Keep command invocation injected and normalize tool output before joining to linked test evidence.

## Testing

Use generated provider outputs for initial mapping/compliance tests. Real coverage.py and grimp invocation belongs in a later provider harness slice after this node has authored assertions.
