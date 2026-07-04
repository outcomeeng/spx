# Audit Payload

Audit verification runs use one public verification type, `audit`. Audit class, audit kind, producer identity, unit nesting, coverage status, and audit finding details live in structured payloads rather than in command paths or verification-type subcommands.

## Rationale

Audit workflows inspect many subjects: instructions, specs, implementation code, tests, architecture, and coverage gaps. A single verification type with structured audit units lets SPX render complete audit coverage and findings across those subjects without multiplying public CLI vocabulary.

## Product properties

1. Every audit run uses `--verification-type audit`; audit class and audit kind are payload fields.
2. Audit scope evidence records nestable units with `unit_id`, optional `parent_unit_id`, audit class, audit kind, subject, coverage status, and producer metadata.
3. Audit finding evidence records the inspected unit, producer metadata, rule, severity, location, message, and observed-versus-expected evidence.

## Verification

### Testing

- ALWAYS: audit verification-type registration accepts `audit` as a supported verification type without adding audit subtype commands ([compliance])
- ALWAYS: audit scope payload validation accepts nestable units with unit identity, audit class, audit kind, subject, coverage status, and producer metadata ([conformance])
- ALWAYS: audit finding validation requires a referenced audit unit, producer metadata, rule, severity, message, and evidence payload ([conformance])
- ALWAYS: audit terminal rollup maps coverage statuses and finding severities into the journal terminal-status vocabulary before terminal completion is recorded ([mapping])
- NEVER: audit class or audit kind appears as a public command path segment under `spx verification run` ([compliance])

### Audit

- ALWAYS: audit payload specifications preserve the distinction between audit coverage evidence and audit finding evidence ([audit])
