# Plan: review run projection

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler/review-evidence-model.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining review projection implementation work.

## Pending work

1. Consume merge-period identity, finding identity, and the run-set context projection from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` when migrating review producers to run-set context.

## GitHub review shape input

GitHub formal reviews provide the external shape this node must be able to ingest or project:

- A review envelope: provider review id, actor, state, body, submitted time, commit id, and URL.
- Inline comments: provider comment id, path, line or position, side, original commit, diff hunk, body, and URL.

SPX stores the platform-neutral structure. Backend adapters and delivery projections decide how to publish it to GitHub reviews, PR comments, local output, or other delivery surfaces.
