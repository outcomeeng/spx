# Scope Resolver Test Harness

PROVIDES scope-resolver fixtures — an integration Config and resolver config built from the production artifact-directory, hidden-prefix, and ignore-source constants, curated exemplar file paths for each scope layer (clean, artifact-directory, hidden-prefix, ignore-source, and multi-layer), a no-op ignore reader, the `makeLayerContext` builder, and the `writeTestFiles`/`writeExclude` writers that materialize them
SO THAT the scope-resolver enabler's L1 scenario, property, and compliance tests
CAN assemble layered scope decisions over real fixture files without restating production scope constants or reimplementing layer-context setup

## Assertions

### Scenarios

- Given the curated exemplar file set, when `writeTestFiles` runs against a spec-tree test env, then every exemplar path — clean, artifact-directory, hidden-prefix, ignore-source, and multi-layer — is materialized under the env's product directory and readable back ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the resolver config and exemplar paths derive their artifact-directory, hidden-prefix, and root segments from `ARTIFACT_DIRECTORIES_DEFAULT`, `HIDDEN_PREFIX_DEFAULT`, and the spec-tree config so fixtures track production predicate inputs ([audit])
- ALWAYS: the multi-layer exemplar path matches more than one scope layer (hidden-prefix and ignore-source) while avoiding artifact directories so it survives the walk — the curated set covers each layer and their overlap ([audit])
- ALWAYS: exemplar files are written through the spec-tree test env, which owns temp-directory lifecycle — the harness creates and removes no directory itself ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — fixtures are written to the real filesystem under the env's temp product directory ([audit])
