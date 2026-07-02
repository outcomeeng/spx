# Plan: Spec-tree materialization

> **Reconcile against `spx/PLAN.md` first.** "materialization" is renamed `backend` (adapter implementations: local / GitHub / future), orthogonal to `persistence` (records / journals / snapshots) and `delivery`. Read this whole node as the `backend` layer. The corrected model also requires additive migration (never a wholesale move) and defers `.surface`. Where this note predates that model, the root plan governs.

This placeholder coordination note records the intended materialization node before `/decompose` assigns final structure and `/author` creates the spec. The directory exists only to preserve context for the restructuring pass — it is the surviving on-`main` coordination that root `spx/PLAN.md` builds on.

## Purpose to author

`spx/23-spec-tree.enabler/24-materialization.enabler` should provide the backend contract that materializes the logical spec-tree foundation.

The materialization contract should cover:

- static current-state reads over products, nodes, decisions, assertions, evidence references, and metadata
- history queries over materialized product paths and metadata records
- per-node metadata storage and retrieval
- dependency input resolution for stale/fresh status projection
- executable operation requests and records
- backend capability reporting when an operation is unavailable

## Candidate children

| Child                               | Responsibility                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `21-filesystem-git-backend.enabler` | Current backend over tracked `spx/` files, Git history, `.spx/` local evidence, and `spx.status.json`.                 |
| `32-executable-operations.enabler`  | Backend-neutral contract for requesting verification, refreshing evidence, and recording executable operation results. |

## Ordering notes

Materialization should sit below source, state, status, traversal, and projection consumers if those consumers need current state and history in context. `/decompose` must decide whether existing `32-spec-tree-source.enabler` stays as a logical source-record layer or splits into generic source records plus filesystem source implementation under this materialization node.

## Questions for `/decompose`

- Does the generic materialization contract belong at index `24`, or does it need a same-index relationship with existing grammar/source children?
- Is node metadata a generic materialization concept with backend-specific encodings, or does each backend own metadata shape end to end?
- Which existing status-file assertions move here, and which move into the filesystem backend child?
- Which operations belong in the materialization contract versus the testing provider?

## Migration notes

- Move `spx.status.json` product meaning out of `spx/31-spec-domain.enabler/21-node-status.enabler`.
- Preserve the filesystem implementation facts from the node-status branch as evidence inventory.
- Keep CLI and web interface behavior outside this node.
