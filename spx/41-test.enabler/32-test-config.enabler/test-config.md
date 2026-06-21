# Test Config

PROVIDES a testing descriptor for spec-tree passing-scope policy
SO THAT `spx test passing`, status reporting, and testing integrations
CAN read passing-scope filters from `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: `spx test passing` reads passing-scope policy from the testing descriptor ([audit])
- ALWAYS: normal `spx test` discovery remains independent from passing-scope filters ([audit])
- ALWAYS: the testing descriptor uses the shared path-filter primitive for node or path selection ([test](tests/test-config.compliance.l1.test.ts), [audit])
- NEVER: read `spx/EXCLUDE` as testing passing-scope policy ([audit])
