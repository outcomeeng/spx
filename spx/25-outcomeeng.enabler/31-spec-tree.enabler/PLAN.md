# PLAN

> Reconcile against `spx/PLAN.md` first. This directory is a PLAN-only placeholder until `/decompose` and `/author` materialize the Outcome Engineering Spec Tree graph nodes. It carries the operator-approved structure intent; it is not product truth.

## Intended Boundary

`spx/25-outcomeeng.enabler/31-spec-tree.enabler` owns Outcome Engineering graph semantics over the artifacts represented by the Spec Tree methodology. It is distinct from `spx/23-spec-tree.enabler`, which owns the backend-neutral library for reading and projecting the tree itself.

This node covers graph concerns that span product truth, tests, source artifacts, and change records. It consumes facts from lower-level libraries and provider tools, then exposes methodology-level ownership and garbage-collection semantics.

## First Decomposition Target

Create:

```text
spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler/
```

The graph aggregate owns the shared graph vocabulary and the ordered graph slices:

```text
21-spec.enabler
32-test.enabler
43-source.enabler
```

The `change` graph slice remains a deferred sibling until `/decompose` settles whether it depends on the source graph, the existing `spx/25-outcomeeng.enabler/31-changes.enabler` record model, or both.

## Slice Order

1. Run `/decompose spx/25-outcomeeng.enabler` to confirm `spx/25-outcomeeng.enabler/31-spec-tree.enabler` as an independent peer of `spx/25-outcomeeng.enabler/31-changes.enabler`.
2. Run `/author` to create the aggregate node specs required for the graph/source slice.
3. Run `/apply` for the first materialized source graph slice after authoring establishes its assertions.
4. Run every applicable auditor gate before merge: PDR auditor for product decisions, ADR auditor for architecture decisions, spec auditor for specs, test-evidence auditor for tests, TypeScript architecture/test/code auditors for implementation, and changes-reviewer for the whole changeset.
5. Run deterministic verification for the touched scope, then `/merge`.
