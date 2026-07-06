# Plan: audit verification type

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/PLAN.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and this node's spec and PDR first. This note coordinates remaining type-specific audit payload work.

## Scope

This node materializes `audit` as an independent verification type sibling of `review`. Every audit run uses `--verification-type audit`; audit class, audit kind, deterministic unit identity, recorded-by identity, expected producer identity, producer provenance, unit nesting, coverage requirement, coverage status, and prior-context partitions are payload fields rather than command-surface subtypes.

## Child work

- Audit evidence schema, validation, stable producer identity, and producer provenance: `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler/PLAN.md`.
- Audit scope projection, terminal rollup, and prior-context selectors: `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/32-audit-run-projection.enabler/PLAN.md`.

## Ordering evidence

| Predecessor                                                                                      | Basis               | Successor                                                                                        | Reason                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler` | Provider / consumer | `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/32-audit-run-projection.enabler` | Audit run projection consumes validated audit units, coverage requirements, coverage statuses, stable producer identity, producer provenance, and findings before it can project audit run state. |

## Sibling relationship

`spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` shares index `65` with `spx/34-verification.enabler/32-verify.enabler/65-review.enabler` because they are independent verification types over the same lifecycle. Audit payload schemas must not introduce `spx audit` or audit subtype commands.
