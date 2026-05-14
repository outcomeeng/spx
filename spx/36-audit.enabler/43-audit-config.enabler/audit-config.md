# Audit Config

PROVIDES an audit descriptor for auditors, target filters, base ref, and storage defaults
SO THAT `spx audit`
CAN execute branch-scoped audits from `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: audit execution settings resolve through a registered audit descriptor ([review])
- ALWAYS: audit target filters use the shared path-filter primitive ([review])
- ALWAYS: audit storage vocabulary is descriptor-owned and not hardcoded outside the descriptor defaults ([review])
- NEVER: audit code parses raw `spx.config.*` content outside config-owned APIs ([review])
