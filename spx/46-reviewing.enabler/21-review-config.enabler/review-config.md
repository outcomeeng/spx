# Review Config

PROVIDES a review descriptor for reviewer selection, target filters, execution defaults, and state policy
SO THAT `spx review branch` and `spx review pr`
CAN resolve local review behavior from `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: review settings resolve through a registered review descriptor ([review])
- ALWAYS: review target filters use the shared path-filter primitive ([review])
- ALWAYS: reviewer selection is descriptor-owned and separated from audit auditor selection ([review])
- NEVER: review code parses raw `spx.config.*` content outside config-owned APIs ([review])
