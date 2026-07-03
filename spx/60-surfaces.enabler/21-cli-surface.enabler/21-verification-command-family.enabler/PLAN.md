# Plan: verification command family

> Reconcile against `spx/60-surfaces.enabler/21-cli-surface.enabler/PLAN.md` and `spx/PLAN.md` first. This note carries child-structure coordination only; product truth lives in the node spec and `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`.

## Deferred child grouping

| Planned child               | Commands                                                                                                                              | Ordering                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `21-run-lifecycle.enabler`  | `start`, `input`, `finish`, core run addressing, and selector diagnostics.                                                            | Provider for evidence and inspection because they require a run identity. |
| `32-run-evidence.enabler`   | `scope add`, `finding add`, payload source, idempotency key, and finding validation boundary.                                         | Depends on run lifecycle.                                                 |
| `43-run-inspection.enabler` | `status`, `render`, and later inspection verbs such as `list` or `show` if they belong to verification rather than journal substrate. | Depends on lifecycle and evidence projection.                             |

## Lower-layer cascade

The next implementation-bearing slice aligns the verification library specs and tests under `spx/34-verification.enabler/32-verify.enabler` from legacy `spx verify` verb names to interface-neutral lifecycle operations consumed by this CLI surface.
