# Plan: review verification type

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This placeholder records the type-specific review payload work; the shared lifecycle remains in the parent node.

## Scope

This node materializes `review` as a verification type-specific payload and projection owner. It keeps `--verification-type review` as the public type value and defines the review finding schema SPX validates at `spx verification run finding add`.

## Pending work

1. Replace the narrow review finding validator with a platform-neutral review comment schema that can carry GitHub formal-review comments without making GitHub the product model.
2. Model a review envelope separately from inline comments: provider ids, actor, state, body, submitted time, commit id, and URL belong to the envelope; path, line or position, side, diff hunk, body, and URL belong to comments.
3. Keep `scope add` for reviewed units and `finding add` for anchored review comments or findings, so a clean reviewed file can be represented without inventing a finding.
4. Decide the lifecycle event that carries the review envelope: start input, a typed summary/envelope event, or finish metadata. Record the decision in the owning spec or decision before implementation.
5. Migrate the plugin `review-changes` runner to call `spx verification run` after SPX accepts the richer review payload and exposes the run locator needed for inspection.

## Sibling relationship

`spx/34-verification.enabler/32-verify.enabler/65-review.enabler` and `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` intentionally share index `65`: review is an open-ended correctness gate, while audit is a checklist-style verification type. They consume the same lifecycle and run-set substrate, and neither type's schema constrains the other.
