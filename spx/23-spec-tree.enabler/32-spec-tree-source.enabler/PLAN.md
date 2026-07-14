# Plan: Source adapter boundary review

> **Reconcile against `spx/PLAN.md` first.** The root plan separates persistence, backend, delivery, and node state and requires additive migration. Source-entry vocabulary remains spec-tree foundation behavior; filesystem walking over tracked `spx/` files remains inventory until a reviewed target projection names its receiver. Where this note predates that model, the root plan governs.

This coordination note records the unresolved source-adapter boundary.

## Current role

`spx/23-spec-tree.enabler/32-spec-tree-source.enabler` provides filesystem-backed and in-memory source adapters that emit backend-neutral spec-tree source entries.

## Boundary question

The source-entry vocabulary belongs to the spec-tree foundation. The filesystem-backed adapter's target receiver remains unresolved until configured node kinds and methodology context injection support the reviewed target structure.

## Candidate split

| Concern                                   | Candidate home                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Source-entry record shape                 | `spx/23-spec-tree.enabler/32-spec-tree-source.enabler`                                   |
| In-memory source fixture adapter          | `spx/23-spec-tree.enabler/32-spec-tree-source.enabler` or test infrastructure            |
| Filesystem walk over tracked `spx/` files | Parked target backend receiver under the root `spx/PLAN.md` re-entry conditions          |
| Invalid/superseded residual retention     | source layer if it is grammar-driven; backend layer if it is storage-completeness-driven |

## Next action

Re-enter `/decompose-next` and `/decompose spx/23-spec-tree.enabler` after configured node kinds and methodology context injection exist. Decide the filesystem-specific source receiver and ordering from a reviewed dependency-evidence matrix before moving behavior.
