# CLI Subprocess Test Harness

PROVIDES shared CLI subprocess fixture constants for executable paths, Node invocation, CLI flags, and load-aware timing thresholds
SO THAT CLI-surface tests across command domains
CAN invoke the packaged SPX executable and subprocess command paths through one source-owned harness vocabulary without duplicating product-root paths, executable names, flags, or timing guardrails

## Assertions

### Mappings

- The CLI subprocess fixture constants map to the product-rooted packaged executable path, Node executable name, version flag, and shared timeout tiers used by CLI subprocess tests ([test](tests/cli-subprocess-test-harness.mapping.l1.test.ts))

### Compliance

- NEVER: the harness exposes source CLI entrypoints as the packaged executable path; packaged-executable tests target `bin/spx.js` under the product root ([test](tests/cli-subprocess-test-harness.compliance.l1.test.ts))
