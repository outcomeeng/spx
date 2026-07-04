# Audit Payload

Audit verification runs use one public verification type, `audit`. Audit class, audit kind, producer identity, unit nesting, coverage status, and audit finding details live in structured payloads rather than in command paths or verification-type subcommands.

## Rationale

Audit workflows inspect many subjects: instructions, specs, implementation code, tests, architecture, and coverage gaps. A single verification type with structured audit units lets SPX render complete audit coverage and findings across those subjects without multiplying public CLI vocabulary.

## Product properties

1. Every audit run uses `--verification-type audit`; audit class and audit kind are payload fields.
2. Audit scope evidence records nestable units with `unit_id`, optional `parent_unit_id`, audit class, audit kind, subject, coverage status, and producer metadata containing producer kind, agent name, agent owning plugin name and version, skill name, skill owning plugin name and version, invocation role, and optional tool version.
3. Audit finding evidence records the inspected unit, the same producer metadata, rule, severity (`blocking` or `debt`), location, message, and observed-versus-expected evidence; terminal rollup approves only complete clean coverage and rejects any required uncovered unit or any finding.

## Verification

### Testing

- ALWAYS: audit verification-type registration accepts `audit` as a supported verification type without adding audit subtype commands ([compliance])
- ALWAYS: audit scope payload validation accepts nestable units with unit identity, audit class, audit kind, subject, coverage status, and producer metadata containing producer kind, agent name, agent owning plugin name and version, skill name, skill owning plugin name and version, invocation role, and optional tool version ([conformance])
- ALWAYS: audit finding validation requires a referenced audit unit, producer metadata, rule, severity `blocking` or `debt`, message, and evidence payload ([conformance])
- ALWAYS: audit terminal rollup maps complete clean required coverage to `approved`, and maps any required unit with coverage status `unsupported`, `missing-skill`, `skipped`, or `incomplete`, or any finding severity `blocking` or `debt`, to `rejected` before terminal completion is recorded ([mapping])
- ALWAYS: prior audit context selectors filter by audit class, audit kind, producer identity, subject path, and changed-file partition ([mapping])
- NEVER: audit class or audit kind appears as a public command path segment under `spx verification run` ([compliance])

### Audit

- ALWAYS: audit payload specifications preserve the distinction between audit coverage evidence and audit finding evidence ([audit])
