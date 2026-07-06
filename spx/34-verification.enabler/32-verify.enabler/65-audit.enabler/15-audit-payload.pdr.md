# Audit Payload

Audit verification runs use one public verification type, `audit`. Audit class, audit kind, deterministic unit identity, normalized subject identity, recorded-by identity, expected producer identity, producer provenance, unit nesting, coverage requirement, coverage status, prior-context partitions, and audit finding details live in structured payloads rather than in command paths or verification-type subcommands.

## Rationale

Audit workflows inspect many subjects: instructions, specs, implementation code, tests, architecture, and coverage gaps. A single verification type with structured audit units lets SPX render complete audit coverage and findings across those subjects without multiplying public CLI vocabulary.

## Product properties

1. Every audit run uses `--verification-type audit`; audit class and audit kind are payload fields. Audit class values are `instructions`, `spec`, and `implementation`. Audit kind compatibility is: `instructions` accepts `skill`, `subagent`, `prompt`, `guide-template`, and `coverage-gap`; `spec` accepts `spec`, `adr`, `pdr`, and `coverage-gap`; `implementation` accepts `code`, `tests`, `architecture`, `eval-evidence`, and `coverage-gap`.
2. Audit scope evidence records a coverage inventory of nestable units with deterministic `unit_id`, optional `parent_unit_id`, audit class, audit kind, normalized subject, coverage requirement (`required` or `optional`), coverage status, prior-context partitions, recorded-by identity, optional recorded-by provenance, optional expected producer identity, and optional producer provenance. Coverage status values are `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, and `incomplete`; prior-context partitions include changed-file partition, optional language partition, and concern partition. Producer provenance is present only when the expected producer executed; `missing-skill`, `unsupported`, and `coverage-gap` units can name an expected producer without producer provenance.
3. Audit unit identity is deterministic from parent unit identity, audit class, audit kind, normalized subject, prior-context partitions, and expected producer identity when defined. Unit identity excludes coverage status, recorded-by identity, recorded-by provenance, and producer provenance. Parent and child identity stay stable across sibling ordering changes, line movement, and producer releases. Subject normalization uses product-relative paths with POSIX separators for file subjects, rejects absolute paths and parent-directory escapes, and uses canonical JSON for non-file subject objects.
4. Audit finding evidence records the inspected unit, stable producer identity, producer provenance, rule, severity (`blocking` or `debt`), location, message, and observed-versus-expected evidence. Stable producer identity contains producer kind, agent name, agent owning plugin name, skill name, skill owning plugin name, and invocation role; producer provenance contains agent owning plugin version, skill owning plugin version, and optional tool version.
5. Audit terminal validation derives the allowed terminal status from coverage and findings before `finish` records terminal completion. It accepts `approved` only for complete clean required coverage, accepts `rejected` for any required uncovered unit or any finding, and rejects a supplied terminal status that conflicts with the derived rollup.

## Verification

### Testing

- ALWAYS: audit verification-type registration accepts `audit` as a supported verification type without adding audit subtype commands ([compliance])
- ALWAYS: audit scope payload validation accepts nestable units with deterministic unit identity, optional parent unit identity, audit class, audit-kind-compatible audit kind, normalized subject, coverage requirement `required` or `optional`, coverage status `audited`, `not-applicable`, `unsupported`, `missing-skill`, `skipped`, or `incomplete`, prior-context partitions, recorded-by identity, optional recorded-by provenance, optional expected producer identity, and optional producer provenance ([conformance])
- ALWAYS: audit finding validation requires a referenced audit unit, stable producer identity, producer provenance, rule, severity `blocking` or `debt`, message, and evidence payload ([conformance])
- ALWAYS: audit unit identity derives from parent unit identity, audit class, audit kind, normalized subject, prior-context partitions, and expected producer identity when defined, and excludes coverage status, recorded-by identity, recorded-by provenance, and producer provenance ([property])
- ALWAYS: audit class and audit kind validation rejects incompatible combinations such as `implementation` with `skill` or `instructions` with `code` ([mapping])
- ALWAYS: audit terminal validation maps every required unit covered by `audited` or `not-applicable` and no findings to `approved`, maps any required unit with coverage status `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding severity `blocking` or `debt`, to `rejected`, rejects a supplied terminal status that conflicts with that mapping, and does not reject solely because an optional unit is uncovered ([mapping])
- ALWAYS: prior audit context selectors filter by audit class, audit kind, expected producer identity when present, finding producer identity for findings, subject path, changed-file partition, language partition, and concern partition ([mapping])
- NEVER: audit class or audit kind appears as a public command path segment under `spx verification run` ([compliance])

### Audit

- ALWAYS: audit payload specifications preserve the distinction between audit coverage evidence and audit finding evidence ([audit])
