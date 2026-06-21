# Ignore Source Test Harness

PROVIDES generator-sampled ignore-source fixtures — integration and reader configs, comment-line and invalid-entry inputs, and property limits — with spec-tree-env EXCLUDE writers (`spxPath`, `excludeContents`, `writeExclude`, `writeExcludeRaw`) and re-exported node-segment generators
SO THAT the ignore-source enabler's L1 scenario, property, and mapping tests
CAN build real EXCLUDE fixtures and reader inputs without reimplementing fixture setup or hardcoding path, filename, or content literals

## Assertions

### Properties

- For all exclude-line sequences, `writeExclude` writes the lines joined by newline to the generator's exclude path through the spec-tree test env, readable back unchanged ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: every fixture value the harness returns — integration config, reader config, comment lines, invalid entries, property limits, root segment, and exclude filename — is drawn from `FILE_INCLUSION_IGNORE_SOURCE_GENERATOR`, never a hardcoded literal ([audit])
- ALWAYS: EXCLUDE fixtures are written through the spec-tree test env, which owns temp-directory creation and removal — the harness creates and removes no directory itself ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — fixtures are written to the real filesystem under the env's temp product directory ([audit])
