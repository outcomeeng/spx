# CLI Subprocess Test Harness

PROVIDES shared CLI subprocess fixture constants that resolve the source-owned packaged CLI artifact descriptor against the product root and add load-aware timing thresholds
SO THAT CLI-surface tests across command domains
CAN invoke the packaged SPX executable and subprocess command paths without duplicating product-root paths, executable names, flags, source-entrypoint relations, or timing guardrails

## Assertions

### Mappings

- The CLI subprocess fixture constants map to the product-rooted packaged executable path, Node executable name, version flag, and shared timeout tiers used by CLI subprocess tests ([test](tests/cli-subprocess-test-harness.mapping.l1.test.ts))

### Compliance

- ALWAYS: the harness derives the packaged executable path, Node executable name, version flag, and source-entrypoint relation from the CLI-interface artifact descriptor, adding only product-root resolution and test execution policy ([test](tests/cli-subprocess-test-harness.compliance.l1.test.ts))
- NEVER: the harness exposes source CLI entrypoints as the packaged executable path; packaged-executable tests target `bin/spx.js` under the product root ([test](tests/cli-subprocess-test-harness.compliance.l1.test.ts))
