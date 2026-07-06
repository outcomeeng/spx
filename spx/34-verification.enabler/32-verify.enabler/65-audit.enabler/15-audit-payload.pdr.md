# Audit Payload

Audit verification runs use one public verification type, `audit`. Audit class, audit kind, stable producer identity, producer provenance, unit nesting, coverage requirement, coverage status, prior-context partitions, and audit finding details live in structured payloads rather than in command paths or verification-type subcommands.

## Rationale

Audit workflows inspect many subjects: instructions, specs, implementation code, tests, architecture, and coverage gaps. A single verification type with structured audit units lets SPX render complete audit coverage and findings across those subjects without multiplying public CLI vocabulary.

## Product properties

1. Every audit run uses `--verification-type audit`; audit class and audit kind are payload fields. Audit class values are `instructions`, `spec`, and `implementation`; audit kind values are `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, and `coverage-gap`.
2. Audit scope evidence records a coverage inventory of nestable units with `unit_id`, optional `parent_unit_id`, audit class, audit kind, subject, coverage requirement (`required` or `optional`), coverage status, prior-context partitions, stable producer identity, and producer provenance. Coverage status values are `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, and `incomplete`; prior-context partitions include changed-file partition, optional language partition, and concern partition.
3. Audit finding evidence records the inspected unit, stable producer identity, producer provenance, rule, severity (`blocking` or `debt`), location, message, and observed-versus-expected evidence. Stable producer identity contains producer kind, agent name, agent owning plugin name, skill name, skill owning plugin name, and invocation role; producer provenance contains agent owning plugin version, skill owning plugin version, and optional tool version. Terminal rollup approves only complete clean required coverage and rejects any required uncovered unit or any finding.

## Verification

### Testing

- ALWAYS: audit verification-type registration accepts `audit` as a supported verification type without adding audit subtype commands ([compliance])
- ALWAYS: audit scope payload validation accepts nestable units with unit identity, audit class `instructions`, `spec`, or `implementation`, audit kind `skill`, `subagent`, `prompt`, `guide-template`, `spec`, `adr`, `pdr`, `code`, `tests`, `architecture`, `eval-evidence`, or `coverage-gap`, subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, stable producer identity, and producer provenance ([conformance])
- ALWAYS: audit finding validation requires a referenced audit unit, stable producer identity, producer provenance, rule, severity `blocking` or `debt`, message, and evidence payload ([conformance])
- ALWAYS: audit terminal rollup maps every required unit covered by `audited` or `not-applicable` and no findings to `approved`, maps any required unit with coverage status `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding severity `blocking` or `debt`, to `rejected`, and does not reject solely because an optional unit is uncovered ([mapping])
- ALWAYS: prior audit context selectors filter by audit class, audit kind, stable producer identity, subject path, changed-file partition, language partition, and concern partition ([mapping])
- NEVER: audit class or audit kind appears as a public command path segment under `spx verification run` ([compliance])

### Audit

- ALWAYS: audit payload specifications preserve the distinction between audit coverage evidence and audit finding evidence ([audit])
