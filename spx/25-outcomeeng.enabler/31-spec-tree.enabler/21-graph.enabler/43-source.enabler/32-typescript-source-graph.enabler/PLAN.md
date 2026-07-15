# PLAN

> Reconcile against `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/43-source.enabler/PLAN.md` first. The spec beside this note declares the provider's truth; the coverage and module-graph descriptors are implemented and passing over injected payloads.

## Remaining Work

1. Real-tool harness slice: invoke actual Vitest coverage runs and a compiler-API or `ts-morph` module walk host-side, feed their real output through the typed payload boundary, and pin the concrete payload construction with tool-specific harness evidence.
2. Migrate changed-test planning to consume source graph facts once the graph contract represents linked-test reachability end to end.
