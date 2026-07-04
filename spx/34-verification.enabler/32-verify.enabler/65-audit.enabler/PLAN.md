# Plan: audit verification type

> Reconcile against `spx/34-verification.enabler/32-verify.enabler/PLAN.md` first. This placeholder records the `audit` verification type expansion from `/var/folders/vg/stx1n5ys4_lgr08v49lg6t880000gp/T/spx-audit-verification-run-contract.md`.

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
   - producer metadata
3. `finding add` records a unit-scoped audit finding with producer metadata, rule, severity, location, message, and observed-versus-expected evidence.
4. Coverage statuses include `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, and `incomplete`.
5. Terminal rollup classifies required audited units and findings as `approved`, `rejected`, `incomplete`, or `unknown`, then settles how those audit rollup values map into the journal terminal-status vocabulary before `finish` records terminal completion.

## Implementation sequence

1. Add an `audit` verification-type registration and a finding validator through the existing verify registry boundary.
2. Add scope-payload validation for audit units if the parent lifecycle keeps generic scope payloads; otherwise add a type-specific scope validator registry parallel to finding validation.
3. Resolve `spx/34-verification.enabler/32-verify.enabler/ISSUES.md` for `status` next actions when more than one verification type exists.
4. Add tests for audit start, audit scope units, audit finding validation, audit terminal rollup, and render/status projection.
5. Migrate audit orchestrator and leaf auditor plugin callers only after SPX validates and projects the audit payload shape.

## Sibling relationship

`spx/34-verification.enabler/32-verify.enabler/65-audit.enabler` shares index `65` with `spx/34-verification.enabler/32-verify.enabler/65-review.enabler` because they are independent verification types over the same lifecycle. Audit payload schemas must not introduce `spx audit` or audit subtype commands.
