# Testing Config

PROVIDES a testing descriptor for spec-tree passing-scope policy
SO THAT `spx test passing`, status reporting, and testing integrations
CAN read passing-scope filters from `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: `spx test passing` reads passing-scope policy from the testing descriptor ([review])
- ALWAYS: normal `spx test` discovery remains independent from passing-scope filters ([review])
- ALWAYS: the testing descriptor uses the shared path-filter primitive for node or path selection ([review])
- NEVER: read `spx/EXCLUDE` as testing passing-scope policy ([review])
