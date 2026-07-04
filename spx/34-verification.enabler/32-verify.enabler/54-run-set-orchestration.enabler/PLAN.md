# Plan: run-set orchestration

> Reconcile against `spx/34-verification.enabler/verification.md`, `spx/34-verification.enabler/32-verify.enabler/PLAN.md`, and this node's spec and PDR first. This note coordinates remaining implementation and surface decisions for several verification runs over one merge period.

## Scope

This node materializes the run-set layer above individual `spx verification run` tokens. It groups repeated local and CI runs for the same merge period, preserves expanding scope, and gives verification producers read-only prior-run context without requiring them to parse rendered comments or raw journal logs.

## Remaining work

1. Implement the run-set selector, projection, and finding-identity tests named by `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`.
2. Implement backend-neutral merge-period identity for local and pull-request backends, including a merge-period-stable run-set scope key separate from each run's changing scope identity.
3. Implement the internal verify-domain run-set context read projection consumed by agent harness workflows and backend delivery projections.
4. Keep any public run-set context command under `spx/60-surfaces.enabler/21-cli-surface.enabler`; this node supplies the internal projection contract first.
5. Add the projection source that restores prior-run context from persisted verification runs without parsing rendered PR comments.
6. Add the generic selector interface that lets verification-type consumer nodes supply type-specific prior-context filters.

## GitHub review shape input

GitHub formal reviews provide the external shape this node must be able to ingest or project:

- A review envelope: provider review id, actor, state, body, submitted time, commit id, and URL.
- Inline comments: provider comment id, path, line or position, side, original commit, diff hunk, body, and URL.

SPX stores the platform-neutral structure. Backend adapters and delivery projections decide how to publish it to GitHub reviews, PR comments, local output, or other delivery surfaces.

## Downstream consumers

- `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/PLAN.md` consumes this for GitHub-shaped review envelope and comment persistence.
- `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/PLAN.md` consumes this for audit merge-period context, coverage gaps, and repeated-run convergence.
