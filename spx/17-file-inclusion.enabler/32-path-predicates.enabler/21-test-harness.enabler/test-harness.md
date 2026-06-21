# Path Predicates Test Harness

PROVIDES path-predicates fixtures derived from the production scope constants — an integration Config, artifact-directory and hidden-prefix predicate configs built from `ARTIFACT_DIRECTORIES_DEFAULT` and `HIDDEN_PREFIX_DEFAULT`, the `spxPath` builder, the `writeExclude` writer, and `makeIgnoreSourceConfig` which materializes an EXCLUDE file and returns a constructed ignore-source predicate config
SO THAT the path-predicates enabler's L1 scenario, property, and mapping tests
CAN exercise each predicate layer against real fixtures without restating production directory and prefix constants or reimplementing reader construction

## Assertions

### Properties

- For all node segments, `makeIgnoreSourceConfig` writes an EXCLUDE file listing the segments and returns a predicate config whose ignore-source reader reports a path under a listed segment as under-ignore-source ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the artifact-directory and hidden-prefix fixture configs derive from `ARTIFACT_DIRECTORIES_DEFAULT` and `HIDDEN_PREFIX_DEFAULT`, and the root segment from the spec-tree config — never restated literals ([audit])
- ALWAYS: EXCLUDE fixtures are written through the spec-tree test env, which owns temp-directory lifecycle — the harness creates and removes no directory itself ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — fixtures and the constructed reader operate on the real filesystem under the env's temp product directory ([audit])
