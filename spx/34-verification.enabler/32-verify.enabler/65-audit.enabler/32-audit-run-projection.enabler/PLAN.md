# Plan: audit run projection

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler/audit-evidence-model.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining audit projection implementation work.

## Pending work

1. Implement the audit terminal-rollup and audit prior-context selector tests named by `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/32-audit-run-projection.enabler/audit-run-projection.md`.
2. Add the shared lifecycle terminal rollup or terminal-status validator that maps audit coverage and finding severity to the recorded terminal result before callers can finish audit runs.
3. Expose audit run-set context selectors from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` before migrating audit producers to prior-run context.
