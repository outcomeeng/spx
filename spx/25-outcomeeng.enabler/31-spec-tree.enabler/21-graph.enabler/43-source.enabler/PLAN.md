# PLAN

> Reconcile against `spx/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/PLAN.md`, and `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/PLAN.md` first. This is the first materialized graph slice.

## Objective

Create the Outcome Engineering source graph slice: a graph over implementation source artifacts that explains which files are owned by durable product truth, which files are covered without ownership, which files are only reachable, and which files are unowned garbage-collection candidates.

SPX must not parse implementation files in the source graph. The spec/test graph boundary supplies declared `[test](...)` link facts from product truth. Language-specific providers supply source facts from established tooling.

## Decomposition

Target structure after `/decompose`:

```text
spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/
├── 21-spec.enabler/          # reserved provider graph: durable truth and linked test declarations
├── 32-test.enabler/          # reserved provider graph: tests derived from spec assertions
└── 43-source.enabler/        # first materialized slice
```

Inside `43-source.enabler`, extract shared enablers before language-specific providers:

```text
21-ownership-model.enabler/
21-provider-contract.enabler/
21-provider-fact-normalization.enabler/
32-typescript-source-graph.enabler/
32-python-source-graph.enabler/
32-rust-source-graph.enabler/
43-garbage-collection.enabler/
```

Ordering evidence:

| Predecessor                                                                       | Basis             | Successor                                                                           | Consequence if absent                                                                                       |
| --------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/21-spec.enabler` | Truth hierarchy   | `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/32-test.enabler`   | Tests cannot be interpreted as evidence without the assertions and links they verify.                       |
| `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/32-test.enabler` | Provider/consumer | `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler` | Source files cannot be owned by product truth without spec-linked tests that exercise or reach them.        |
| `ownership-model`, `provider-contract`, `provider-fact-normalization`             | Shared substrate  | language source graph providers                                                     | Providers cannot produce comparable facts without shared identity, provenance, and normalization contracts. |
| language source graph providers                                                   | Provider/consumer | `43-garbage-collection.enabler`                                                     | GC cannot classify unowned source without normalized provider facts.                                        |

## Provider Direction

The first provider set should use established tools instead of SPX parsing implementation source:

- TypeScript: Vitest/Vite coverage or module-graph facts.
- Python: coverage.py for executed coverage and grimp for static import graph facts.
- Rust: cargo llvm-cov for executed coverage and rust-analyzer module graph facts.

Provider output is evidence, not ownership authority. Ownership authority is:

```text
spec assertion -> declared test-link fact -> linked test file -> provider facts -> source ownership classification
```

## Authoring Plan

1. Invoke `/decompose spx/25-outcomeeng.enabler` and confirm the new `spx/25-outcomeeng.enabler/31-spec-tree.enabler` aggregate placement.
2. Invoke `/decompose spx/25-outcomeeng.enabler/31-spec-tree.enabler` and confirm `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler`.
3. Invoke `/decompose spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler` and confirm the `spec -> test -> source` ordering.
4. Invoke `/author` to create the parent and source graph specs.
5. Add any PDR needed for user-visible source ownership and garbage-collection semantics.
6. Add any ADR needed for provider boundaries, fact normalization, and the no-implementation-parsing rule.
7. Run PDR, ADR, and spec auditors until APPROVED.

## Apply Plan

After authoring produces the source graph assertions:

1. Invoke `/apply spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler`.
2. Use `/test` and the TypeScript testing skill to create the first deterministic evidence.
3. Implement the first slice in TypeScript by consuming declared test-link facts and provider-style facts through injected provider fixtures.
4. Keep language/tool provider implementation behind a registry-style contract that mirrors validation's explicit descriptor pattern.
5. Run the TypeScript architecture, test, and code audit gates until APPROVED.
6. Run changes-reviewer over the whole changeset because this work crosses graph, test, and provider boundaries.
7. Run `pnpm run validate`, focused `spx test` for the changed node scope, and `pnpm run build` before opening or merging a PR.
8. Invoke `/merge` and continue until the change reaches the default branch on origin or a lifecycle gate blocks.

## Acceptance

- Source ownership is explained through graph semantics under Outcome Engineering, not as a `spx/23-spec-tree.enabler` library detail.
- Source graph operations consume declared `[test](...)` link facts and do not parse implementation source files.
- Language-specific source facts enter through provider descriptors and normalized provider output.
- TypeScript, Python, and Rust providers are independent peers that share the ownership model, provider contract, and normalization substrate.
- Garbage-collection candidates are derived from the source graph, not from a language import graph alone.
