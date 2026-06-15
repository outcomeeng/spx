# Audit Config

PROVIDES an audit descriptor for auditors, target filters, and base ref
SO THAT `spx audit`
CAN execute branch-scoped audits from `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: audit execution settings — auditors, target filters, base ref — resolve through a registered audit descriptor ([test](tests/audit-config.compliance.l1.test.ts), [test](tests/audit-config.mapping.l1.test.ts))
- ALWAYS: audit target filters use the shared path-filter primitive ([test](tests/audit-config.compliance.l1.test.ts), [test](tests/audit-config.mapping.l1.test.ts))
- NEVER: audit code parses raw `spx.config.*` content outside config-owned APIs ([audit])
- NEVER: the audit descriptor carries verdict-artifact storage vocabulary — run-journal path components derive from state-store defaults per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
