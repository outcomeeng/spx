# PLAN

> Reconcile against `spx/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/PLAN.md`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/PLAN.md`, and `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/PLAN.md` first. This is a coordination placeholder; `/author` creates the spec before implementation.

## Provider Boundary

The TypeScript provider supplies normalized implementation-source facts to the source graph provider contract. It does not decide source ownership and does not parse Spec Tree Markdown.

Use established TypeScript tooling:

- Vitest/Vite coverage output for executed coverage facts.
- TypeScript compiler API or `ts-morph` for module graph facts.

The provider exports facts into the shared source graph vocabulary:

```text
language: typescript
provider: vitest-v8-coverage | vite-module-graph | typescript-compiler-api | ts-morph
artifact: product-root-relative source path
fact: covered | reachable | imports
provenance: tool, version/config digest when available, command or descriptor id
```

## Implementation Placement

Keep the first TypeScript implementation under the Outcome Engineering graph core boundary:

```text
src/outcomeeng/spec-tree/graph/source/providers/typescript/
```

This path is a TypeScript host adapter around the graph kernel. Avoid `src/domains/...` placement so the graph kernel can later move behind a Rust module without changing command or provider contracts.

## First Slice

1. Author this node's spec after the shared `21-provider-contract.enabler` and `21-provider-fact-normalization.enabler` specs exist.
2. Implement only descriptor shape and normalization for injected TypeScript provider facts in the first source-graph PR if the shared provider contract is not yet ready for real tool invocation.
3. Add real Vitest/Vite and TypeScript compiler API or `ts-morph` adapters in later slices with tool-specific harness evidence.
4. Migrate changed-test planning to consume source graph facts only after the graph contract can represent linked-test reachability.

## Testing

Use `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/tests/source.compliance.l1.test.ts` for the shared first slice, then add TypeScript-provider-specific tests in this node after `/author` creates assertions.

Provider tests should use generated provider facts and injected command/file-reader outputs. They should not use framework mocks or test-owned copies of source vocabulary.
