# Plan: review run projection

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler/review-evidence-model.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining review projection implementation work.

## Pending work

1. Implement the review envelope and review comment projection tests named by `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/32-review-run-projection.enabler/review-run-projection.md`.
2. Decide the lifecycle event that carries the review envelope: start input, a typed summary/envelope event, or finish metadata. Record the decision in the owning spec or decision before implementation.
3. Consume merge-period identity and finding identity from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` before migrating review producers to run-set context.
