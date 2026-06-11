# Audit Test Harness

PROVIDES a reusable audit fixture factory with temp product directory creation, pre-written verdict XML file construction, `.spx/nodes/` directory setup, and branch run-file directory path derivation
SO THAT `32-verify.enabler` and `76-audit-cli.enabler`
CAN write Level 1 tests without reimplementing fixture setup or hardcoding path-encoding logic

## Assertions

### Scenarios

- Given no arguments, when `createAuditHarness()` is called, then a temp product directory is created with a `.spx/nodes/` directory ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a harness and a spec node path, when `nodeDir(nodePath)` is called, then the returned path equals `.spx/nodes/` joined with the encoded node path, where encoding replaces every `/` with `-` per ADR `15-audit-directory` ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a harness, a spec node path, and a verdict XML string, when `writeVerdict(nodePath, xml)` is called, then a file named `{YYYY-MM-DD_HH-mm-ss}.audit.xml` (UTC timestamp) is created inside the path-encoded node directory per ADR `15-audit-directory` ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a harness, when `cleanup()` is called, then the temp directory and all contents are removed ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a product directory and branch slug, when `auditBranchRunsDir(productDir, branchSlug)` is called, then the returned path equals `.spx/branch/{branch-slug}/audit/runs` joined under the product directory ([test](tests/audit-test-harness.scenario.l1.test.ts))

### Properties

- `nodeDir(nodePath)` is deterministic: for all spec node path strings including paths with multiple segments, special characters, and varied depths, the same input always produces the same encoded output ([test](tests/audit-test-harness.property.l1.test.ts))
- No hardcoded path segments appear in the harness module — node artifact values derive from `DEFAULT_AUDIT_CONFIG` and branch run values derive from state-store constants ([audit])

### Compliance

- ALWAYS: derive the `.spx/nodes/` root from `DEFAULT_AUDIT_CONFIG` and the branch run-file directory from state-store scope helpers per ADR `15-audit-directory` ([audit](../15-audit-directory.adr.md))
- NEVER: hardcode the string `"nodes"` or any path separator outside source-owned constants ([audit](../15-audit-directory.adr.md))
