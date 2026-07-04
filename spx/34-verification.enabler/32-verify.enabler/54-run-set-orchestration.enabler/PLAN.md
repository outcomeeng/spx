# Plan: run-set orchestration

> Reconcile against `spx/PLAN.md`, `spx/34-verification.enabler/PLAN.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This placeholder records the shared envelope and orchestration work for several verification runs over one merge period.

## Scope

This node materializes the run-set layer above individual `spx verification run` tokens. It groups repeated local and CI runs for the same merge period, preserves expanding scope, and gives verification producers read-only prior-run context without requiring them to parse rendered comments or raw journal logs.

## Shape to settle

1. Define a backend-neutral merge-period identity that works locally and for pull requests.
2. Define the run-set projection shape: current scope, prior runs, active findings, resolved findings, reopened findings, and coverage gaps.
3. Define finding identity across repeated runs using verification type, producer skill, normalized subject, rule, and message or evidence fingerprint; line numbers stay display metadata.
4. Decide whether the public lifecycle grows a run-set/context command such as `spx verification context render`, or whether this remains an internal projection consumed by agent harness workflows first.
5. Add projection tests that restore prior-run context from persisted verification runs without parsing rendered PR comments.

## GitHub review shape input

GitHub formal reviews provide the external shape this node must be able to ingest or project:

- A review envelope: provider review id, actor, state, body, submitted time, commit id, and URL.
- Inline comments: provider comment id, path, line or position, side, original commit, diff hunk, body, and URL.

SPX stores the platform-neutral structure. Backend adapters and delivery projections decide how to publish it to GitHub reviews, PR comments, local output, or later surfaces.

## Downstream consumers

- `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/PLAN.md` consumes this for GitHub-shaped review envelope and comment persistence.
- `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/PLAN.md` consumes this for audit merge-period context, coverage gaps, and repeated-run convergence.
