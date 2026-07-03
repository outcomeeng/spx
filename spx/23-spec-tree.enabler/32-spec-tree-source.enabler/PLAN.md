# Plan: Source adapter boundary review

> **Reconcile against `spx/PLAN.md` first.** This source-adapter boundary was opened by the backend restructuring. The corrected model renames "materialization" to `backend`, separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, and requires additive migration. Source-entry vocabulary remains logical spec-tree foundation behavior; filesystem walking over tracked `spx/` files may move under the local backend. Where this note predates that model, the root plan governs.

This coordination note records the source-adapter boundary question opened by the materialization restructure.

## Current role

`spx/23-spec-tree.enabler/32-spec-tree-source.enabler` provides filesystem-backed and in-memory source adapters that emit backend-neutral spec-tree source entries.

## Boundary question

The filesystem-backed adapter may belong partly under the new materialization backend, while the source-entry vocabulary remains part of the logical foundation.

## Candidate split

| Concern                                   | Candidate home                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Source-entry record shape                 | `spx/23-spec-tree.enabler/32-spec-tree-source.enabler`                                   |
| In-memory source fixture adapter          | `spx/23-spec-tree.enabler/32-spec-tree-source.enabler` or test infrastructure            |
| Filesystem walk over tracked `spx/` files | `spx/23-spec-tree.enabler/24-materialization.enabler/21-filesystem-git-backend.enabler`  |
| Invalid/superseded residual retention     | source layer if it is grammar-driven; backend layer if it is storage-completeness-driven |

## Next action

Run `/decompose spx/23-spec-tree.enabler` and decide whether to move filesystem-specific source behavior under the backend or leave it as the first backend implementation of the source port.
