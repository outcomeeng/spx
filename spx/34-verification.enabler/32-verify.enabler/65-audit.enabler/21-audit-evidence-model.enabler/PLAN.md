# Plan: audit evidence model

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`, `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/15-audit-payload.pdr.md`, and `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This note coordinates remaining audit evidence implementation work; shared lifecycle mechanics remain in `spx/34-verification.enabler/32-verify.enabler`.

## Pending work

1. Implement the audit scope schema, audit finding schema, and audit command-surface tests named by `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler/audit-evidence-model.md` and `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`.
2. Add an `audit` verification-type registration and scope/finding validators through the shared verification-type evidence-validator registry.
3. Migrate audit run drivers and leaf skill producer callers after SPX validates and projects the audit payload shape.
