# Audit Config

PROVIDES an audit descriptor for auditors, target filters, base ref, and storage defaults
SO THAT `spx audit`
CAN execute branch-scoped audits from `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: audit execution settings resolve through a registered audit descriptor ([test](tests/audit-config.compliance.l1.test.ts), [test](tests/audit-config.mapping.l1.test.ts))
- ALWAYS: audit target filters use the shared path-filter primitive ([test](tests/audit-config.compliance.l1.test.ts), [test](tests/audit-config.mapping.l1.test.ts))
- ALWAYS: audit storage vocabulary is descriptor-owned and not hardcoded outside the descriptor defaults ([test](tests/audit-config.compliance.l1.test.ts), [test](tests/audit-config.mapping.l1.test.ts), [audit])
- NEVER: audit code parses raw `spx.config.*` content outside config-owned APIs ([audit])
