# PLAN

> Reconcile against `spx/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/PLAN.md`, and `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/PLAN.md` first. This is a coordination placeholder; `/author` creates the spec before implementation.

## Provider Boundary

The Rust provider supplies normalized implementation-source facts to the source graph provider contract. It does not decide source ownership and does not parse Spec Tree Markdown.

Use established Rust tooling:

- cargo llvm-cov JSON for executed coverage facts.
- rust-analyzer for module/source graph facts.

The provider exports facts into the shared source graph vocabulary:

```text
language: rust
provider: cargo-llvm-cov | rust-analyzer
artifact: product-root-relative source path
fact: covered | reachable | imports
provenance: tool, version/config digest when available, command or descriptor id
```

## Implementation Placement

The source graph kernel should be shaped so this node can become the natural extraction target for a future Rust implementation:

```text
src/outcomeeng/spec-tree/graph/source/kernel/
src/outcomeeng/spec-tree/graph/source/providers/rust/
```

The TypeScript host may call Rust tooling or a future Rust graph module, but ownership classification and normalized graph vocabulary must stay host-independent.

## First Slice

1. Author this node's spec after the shared `21-provider-contract.enabler` and `21-provider-fact-normalization.enabler` specs exist.
2. Keep the Rust provider independent of the TypeScript provider; both consume the same shared provider contract.
3. Treat a future Rust graph kernel as an implementation swap behind the same normalized fact contract, not as a product-model rewrite.

## Testing

Use generated Rust provider facts for the shared first slice. Real cargo llvm-cov and rust-analyzer invocation belongs in a later provider harness slice after this node has authored assertions.
