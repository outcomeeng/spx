# Plan: review evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/review.md`, `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/15-review-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining review evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Implement the review envelope, review comment, review scope, and review payload tests named by `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler/review-evidence-model.md`.
2. Replace the narrow review finding validator with platform-neutral reviewed-unit and review-comment schemas registered through the shared verification-type evidence-validator registry for `scope` and `finding`.
3. Decide the lifecycle event that carries the review envelope: start input, a typed summary/envelope event, or finish metadata. Record the decision in the owning spec or decision before implementation.
4. Migrate the plugin `review-changes` runner to call `spx verification run` after SPX accepts the richer review payload and exposes the run locator needed for inspection.
