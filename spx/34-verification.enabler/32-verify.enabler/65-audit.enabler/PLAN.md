# Plan: audit verification type

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/PLAN.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and this node's spec and PDR first. This note coordinates remaining type-specific audit payload work.

## Scope

This node materializes `audit` as an independent verification type sibling of `review`. Every audit run uses `--verification-type audit`; audit class, audit kind, producer identity, unit nesting, and coverage status are payload fields rather than command-surface subtypes.

## Child work

- Audit evidence schema, validation, clean coverage, and producer metadata: `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/21-audit-evidence-model.enabler/PLAN.md`.
- Audit terminal rollup and prior-context selectors: `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/32-audit-run-projection.enabler/PLAN.md`.

## Sibling relationship

`spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` shares index `65` with `spx/34-verification.enabler/32-verify.enabler/65-review.enabler` because they are independent verification types over the same lifecycle. Audit payload schemas must not introduce `spx audit` or audit subtype commands.
