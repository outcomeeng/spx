# Session Test Harness

PROVIDES a reusable session fixture factory with temp directory creation, session file writing, and status directory lookup — all derived from `SESSION_STATUSES` and `DEFAULT_CONFIG`
SO THAT core-operations, session-lifecycle, advanced-operations, and auto-injection outcome nodes
CAN write Level 1 and Level 2 tests without hardcoding status strings or reimplementing fixture setup

## Assertions

### Scenarios

- Given no arguments, when `createSessionHarness()` is called, then a temp directory is created with one subdirectory per member of `SESSION_STATUSES` ([test](tests/session-test-harness.unit.test.ts))
- Given a harness, when `writeSession(status, id, metadata)` is called, then a markdown file with YAML front matter is created in the correct status subdirectory ([test](tests/session-test-harness.unit.test.ts))
- Given a harness, when `cleanup()` is called, then the temp directory and all contents are removed ([test](tests/session-test-harness.unit.test.ts))

### Properties

- Status subdirectory names match `DEFAULT_CONFIG.sessions.statusDirs` for every member of `SESSION_STATUSES` ([test](tests/session-test-harness.unit.test.ts))
- `statusDir(status)` returns an absolute path for every valid `SessionStatus` ([test](tests/session-test-harness.unit.test.ts))
- No hardcoded status strings appear in the harness module — all values derive from `SESSION_STATUSES` and `DEFAULT_CONFIG` ([review])

### Compliance

- ALWAYS: derive directory names from `DEFAULT_CONFIG.sessions.statusDirs` per ADR `21-directory-structure` ([review](../21-directory-structure.adr.md))
- NEVER: hardcode status strings outside of `SESSION_STATUSES` and `DEFAULT_CONFIG` per ADR `21-directory-structure` ([review](../21-directory-structure.adr.md))
