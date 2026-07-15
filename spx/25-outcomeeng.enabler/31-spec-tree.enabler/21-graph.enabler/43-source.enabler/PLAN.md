# PLAN

> Reconcile against `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/PLAN.md` first. The source-graph kernel is implemented and passing; this note coordinates the remaining provider slices.

## Shipped Structure

The kernel lives under `src/outcomeeng/spec-tree/graph/source/` as modules inside this node — ownership model (`kernel/`), provider descriptor contracts and explicit-import registry (`providers/`), canonical product-root-relative path identity (`normalize/`), and garbage-collection candidate derivation (`gc/`). The child enablers are the language providers only:

```text
32-typescript-source-graph.enabler/
32-python-source-graph.enabler/
32-rust-source-graph.enabler/
```

The providers are independent peers sharing the kernel's ownership model, provider contract, and normalization substrate.

## Provider Direction

Providers consume established tooling output; SPX never parses implementation source itself:

- TypeScript: Vitest/Vite coverage facts plus TypeScript compiler API or `ts-morph` module facts.
- Python: coverage.py for executed coverage and grimp for static import graph facts.
- Rust: cargo llvm-cov for executed coverage and rust-analyzer module graph facts.

Provider output is evidence, not ownership authority. Ownership authority is:

```text
spec assertion -> declared test evidence-link fact -> linked test file -> provider facts -> source ownership classification
```

## Remaining Work

1. Author the `32-typescript-source-graph.enabler` spec via `/author` (confirm index placement via `/decompose` if the peer set changes). The provider registers through an explicit import in `providers/registry.ts` and emits raw facts the kernel normalizes through `normalize/`.
2. `/apply` the TypeScript provider: RED tests first, then an adapter that turns Vitest/V8 coverage output and compiler-API module facts into provider facts.
3. Python and Rust provider slices follow the same shape as independent peers.
4. After a first real provider lands, add the operator-facing source ownership report (the surface that names this repository's unowned garbage-collection candidates).
5. Route changed-test planning toward this graph contract once the source graph owns test-to-source reachability; the existing changed-set related-test adapter is migration evidence, not the target architecture.

## Acceptance

- Language-specific source facts enter only through provider descriptors and normalized provider output.
- TypeScript, Python, and Rust providers are independent peers that share the ownership model, provider contract, and normalization substrate.
- Garbage-collection candidates are derived from the source graph, not from a language import graph alone.
