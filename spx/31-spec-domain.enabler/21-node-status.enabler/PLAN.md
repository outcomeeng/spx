# Plan: Evacuate node-status business logic

> **Reconcile against `spx/PLAN.md` first.** Status/state semantics evacuate to spec-tree (`node-state` derivation) and to `persistence` via `backend` (the rename of "materialization"). The corrected model separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, and requires additive migration (never a wholesale move). Where this note predates that model, the root plan governs.

This coordination note records that `spx/31-spec-domain.enabler/21-node-status.enabler` is the wrong long-term owner for state, status, stale, and status-file semantics.

## Node-status changeset disposition

The node-status staleness implementation should not merge in its present ownership shape.

Preserve as evidence inventory:

- `spx/EXCLUDE` affects status freshness.
- TypeScript runtime import extensions affect product-input discovery.
- CommonJS `require`, dynamic `import`, `import type`, and import-equals forms affect TypeScript product-input discovery.
- Root-level relative imports affect TypeScript product-input discovery.
- Stale status is metadata and does not change lifecycle state.

Discard as architecture:

- TypeScript dependency graph walking inside `src/lib/node-status/`
- status dependency graph ownership inside spec-domain
- filesystem status-file schema ownership inside spec-domain
- CLI command path as orchestration owner

## Target role

Spec-domain should consume spec-tree status operations and render the result for interfaces. This node may disappear, shrink to interface behavior, or become a spec-domain adapter node after the provider responsibilities move.

## Move candidates

| Current concern             | Target owner                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| Lifecycle/state vocabulary  | `spx/23-spec-tree.enabler/76-node-state-derivation.enabler` plus methodology PDR |
| Stale/fresh semantics       | `spx/23-spec-tree.enabler` logical foundation                                    |
| Status dependency inputs    | materialization contract plus testing provider                                   |
| `spx.status.json` schema    | filesystem backend child                                                         |
| TypeScript import expansion | TypeScript testing descriptor path                                               |
| CLI status rendering        | `spx/31-spec-domain.enabler/32-spec-cli-rendering.enabler` or command child      |

## Next action

Do not add more implementation under this node until the provider and backend nodes exist. Use this node only to guide migration and to remove consumer-owned business logic.
