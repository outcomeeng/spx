# Status Rollup

WE BELIEVE THAT displaying aggregated test status for every node in the spec tree
WILL reduce the time developers spend finding which specs need attention by 60%
CONTRIBUTING TO faster iteration cycles and higher spec-test coverage across the product

## Assertions

### Scenarios

- Given a node with all passing tests, when status is computed, then the node reports "passing" ([test](tests/status-rollup.scenario.l1.test.{ext}))
- Given a node with one failing test, when status is computed, then the node reports "failing" ([test](tests/status-rollup.scenario.l1.test.{ext}))
- Given a node with no tests, when status is computed, then the node reports "declared" ([test](tests/status-rollup.scenario.l1.test.{ext}))
- Given a parent with mixed child statuses, when status is rolled up, then the parent reports the worst child status ([test](tests/status-rollup.scenario.l1.test.{ext}))

### Mappings

- Child status combination maps to parent status: all passing → passing, any failing → failing ([test](tests/status-rollup.mapping.l1.test.{ext}))

### Properties

- Rollup is monotonic: adding a passing test never worsens a node's status ([test](tests/status-rollup.property.l1.test.{ext}))
- Rollup is deterministic: same tree always produces same status map ([test](tests/status-rollup.property.l1.test.{ext}))

### Compliance

- ALWAYS: derive status from test results, never from manually assigned labels — `spx/55-example.enabler/15-status-derivation.adr.md` requires status reflect reality ([audit])
- NEVER: cache status across separate runs — each invocation recomputes from current state ([test](tests/status-rollup.compliance.l1.test.{ext}))
