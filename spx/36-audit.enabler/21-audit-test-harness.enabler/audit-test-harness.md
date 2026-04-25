# Audit Test Harness

PROVIDES a reusable audit fixture factory with temp project-root creation, pre-written verdict XML file construction, and `.spx/nodes/` directory setup — all derived from `DEFAULT_AUDIT_CONFIG`
SO THAT `32-verify.enabler` and `76-audit-cli.enabler`
CAN write Level 1 tests without reimplementing fixture setup or hardcoding path-encoding logic

## Assertions

### Scenarios

- Given no arguments, when `createAuditHarness()` is called, then a temp project root is created with a `.spx/nodes/` directory ([test](tests/audit-test-harness.unit.test.ts))
- Given a harness and a spec node path, when `nodeDir(nodePath)` is called, then the returned path equals `.spx/nodes/` joined with the encoded node path, where encoding replaces every `/` with `-` per ADR `15-audit-directory` ([test](tests/audit-test-harness.unit.test.ts))
- Given a harness, a spec node path, and a verdict XML string, when `writeVerdict(nodePath, xml)` is called, then a file named `{YYYY-MM-DD_HH-mm-ss}.audit.xml` (UTC timestamp) is created inside the path-encoded node directory per ADR `15-audit-directory` ([test](tests/audit-test-harness.unit.test.ts))
- Given a harness, when `cleanup()` is called, then the temp directory and all contents are removed ([test](tests/audit-test-harness.unit.test.ts))

### Properties

- `nodeDir(nodePath)` is deterministic: for all spec node path strings including paths with multiple segments, special characters, and varied depths, the same input always produces the same encoded output ([test](tests/audit-test-harness.unit.test.ts))
- No hardcoded path segments appear in the harness module — all values derive from `DEFAULT_AUDIT_CONFIG` ([review])

### Compliance

- ALWAYS: derive the `.spx/nodes/` root from `DEFAULT_AUDIT_CONFIG` per ADR `15-audit-directory` ([review](../15-audit-directory.adr.md))
- NEVER: hardcode the string `"nodes"` or any path separator outside of `DEFAULT_AUDIT_CONFIG` ([review](../15-audit-directory.adr.md))
