# PLAN

> Reconcile against `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/PLAN.md` first. The spec beside this note declares the provider's truth; this note coordinates the implementation slices.

## Remaining Work

1. `/apply` this node: RED tests first (generated tool-output payloads via `testing/generators/outcomeeng/`), then the adapter under `src/outcomeeng/spec-tree/graph/source/providers/typescript/`, registered through an explicit import in `src/outcomeeng/spec-tree/graph/source/providers/registry.ts`.
2. The architecture step settles how tool output enters the descriptor: every module under the source-graph path is pure per `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/21-kernel-host-split.adr.md`, so Vitest coverage and module-graph payloads arrive as typed data through the provider's input boundary, and the descriptor contract may need an amendment for that injection.
3. Real Vitest coverage-run and module-graph harness evidence (invoking the actual tools and feeding their real output through the provider) belongs to a follow-up slice with tool-specific harness support.
4. Migrate changed-test planning to consume source graph facts only after the graph contract represents linked-test reachability end to end.
