# Plan: audit evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`, `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining audit evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Migrate audit run drivers and leaf skill producer callers to `spx verification run` for individual audit runs; prior-run context waits for `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/PLAN.md`.
