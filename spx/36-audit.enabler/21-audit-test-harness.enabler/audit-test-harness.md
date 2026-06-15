# Audit Test Harness

PROVIDES a reusable audit fixture factory with temp product directory creation, branch run-file directory derivation, and run-journal construction
SO THAT `54-branch-run-state.enabler` and audit run-state consumers
CAN write Level 1 tests without reimplementing fixture setup or hardcoding path derivation

## Assertions

### Scenarios

- Given no arguments, when `createAuditHarness()` is called, then a temp product directory is created ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a product directory and branch slug, when `auditBranchRunsDir(productDir, branchSlug)` is called, then the returned path equals `.spx/branch/{branch-slug}/audit/runs` joined under the product directory ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a harness, a branch slug, and a sequence of run events, when a run journal is written, then a run file holding those events in append order is created under the branch runs directory ([test](tests/audit-test-harness.scenario.l1.test.ts))
- Given a harness, when `cleanup()` is called, then the temp directory and all contents are removed ([test](tests/audit-test-harness.scenario.l1.test.ts))

### Properties

- `auditBranchRunsDir` is deterministic: for all product directory and branch slug strings, the same inputs always produce the same path ([test](tests/audit-test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: derive the branch run-file directory from state-store scope helpers per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit](../15-audit-directory.adr.md))
- NEVER: construct verdict-XML artifacts or node-first `.spx/nodes/` directories — the harness builds run journals only ([audit](../15-audit-directory.adr.md))
