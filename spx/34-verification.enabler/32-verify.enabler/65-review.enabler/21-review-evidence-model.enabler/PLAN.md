# Plan: review evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/review.md`, `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/15-review-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining review evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Implement the review envelope, reviewed-unit, and review-comment payload tests named by `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler/review-evidence-model.md`.
2. After `spx/34-verification.enabler/32-verify.enabler/PLAN.md` widens the current finding-validator registry into the shared evidence-validator registry, register platform-neutral reviewed-unit scope and review-comment finding schemas through it.
3. Keep review-envelope carrier and schema-validation placement pending with the parent verification-run lifecycle; do not assign envelope validation to `scope`, `finding`, or the projection consumer until that lifecycle event is specified.
4. Migrate the plugin `review-changes` runner to call `spx verification run` after SPX accepts the richer review payload and exposes the run locator needed for inspection.
