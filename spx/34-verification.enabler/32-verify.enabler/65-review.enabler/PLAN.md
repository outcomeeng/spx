# Plan: review verification type

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/PLAN.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and this node's spec and PDR first. This note coordinates remaining type-specific review payload work; the shared lifecycle remains in the parent node.

## Scope

This node materializes `review` as a verification type-specific aggregate boundary. It keeps `--verification-type review` as the public type value and routes concrete review evidence work to child nodes.

## Child work

- Review evidence schema and validation: `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler` is passing with co-located payload evidence; the review-producer migration onto `spx verification run` is queued in the plugins repository's own session queue.
- Review envelope, reviewed-unit, comment, and run-set projection: `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/32-review-run-projection.enabler` is passing with co-located run-set connection evidence — review prior-run context consumes the run-set projection's merge-period and finding identity through review-owned extractors.

## Ordering evidence

| Predecessor                                                                                        | Basis               | Successor                                                                                          | Reason                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler` | Provider / consumer | `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/32-review-run-projection.enabler` | Review run projection consumes validated review envelopes, reviewed units, and review comments before it can project review evidence and clean units. |

## Sibling relationship

`spx/34-verification.enabler/32-verify.enabler/65-review.enabler` and `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` intentionally share index `65`: review is an open-ended correctness gate, while audit is a checklist-style verification type. They consume the same lifecycle and run-set substrate, and neither type's schema constrains the other.
