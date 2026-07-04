# Plan: audit verification type

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/PLAN.md`, `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler/run-set-orchestration.md`, and this node's spec and PDR first. This note coordinates remaining type-specific audit payload work.

## Scope

This node materializes `audit` as an independent verification type sibling of `review`. Every audit run uses `--verification-type audit`; audit class, audit kind, producer identity, unit nesting, and coverage status are payload fields rather than command-surface subtypes.

## Payload model

1. Run input records the audit request, changeset scope, merge-period identity, orchestrator agent, orchestrator skill, and requested audit plan.
2. `scope add` records nestable audit units:
   - `unit_id`
   - `parent_unit_id`
   - `audit_class`: `instructions`, `spec`, or `implementation`
   - `audit_kind`: `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, or `coverage-gap`
   - subject
   - coverage status
   - producer metadata: producer kind, agent name, agent owning plugin name/version, skill name, skill owning plugin name/version, invocation role, and optional tool version
3. `finding add` records a unit-scoped audit finding with producer metadata, rule, severity (`blocking` or `debt`), location, message, and observed-versus-expected evidence.
4. Coverage statuses include `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, and `incomplete`.
5. Terminal rollup maps every required unit covered by `audited` or `not-applicable` and no findings to `approved`; any required unit covered by `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding severity `blocking` or `debt`, maps to `rejected`.

## Implementation sequence

1. Implement the audit scope, audit finding, audit rollup, and audit command-surface tests named by `spx/34-verification.enabler/32-verify.enabler/65-audit.enabler/audit.md`.
2. Add an `audit` verification-type registration and scope/finding validators through the shared verification-type evidence-validator registry.
3. Migrate audit orchestrator and leaf auditor plugin callers only after SPX validates and projects the audit payload shape and exposes the run-set context selectors from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`.

## Sibling relationship

`spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` shares index `65` with `spx/34-verification.enabler/32-verify.enabler/65-review.enabler` because they are independent verification types over the same lifecycle. Audit payload schemas must not introduce `spx audit` or audit subtype commands.
