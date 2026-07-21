# Plan: review evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/review.md`, `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/15-review-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining review evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Implement the review envelope, reviewed-unit, and review-comment payload tests named by `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler/review-evidence-model.md`.
2. Add co-located evidence-model status for the already-registered platform-neutral reviewed-unit scope and review-comment finding schemas.
3. Migrate the plugin `review-changes` runner to `spx verification run` for individual review runs; prior-run convergence consumes `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`.
