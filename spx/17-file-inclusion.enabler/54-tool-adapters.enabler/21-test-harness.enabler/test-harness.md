# Tool Adapters Test Harness

PROVIDES pure tool-adapter fixtures — `makeScope` building a scope result from excluded and included path lists, `makeAdapterConfig` building a single adapter config from an ignore flag, and `makeToolAdaptersConfig` building a multi-tool adapter config from a tool-to-flag map
SO THAT the tool-adapters enabler's L1 scenario, mapping, and property tests
CAN construct scope results and adapter configs without restating the adapter config shape

## Assertions

### Properties

- For all tool-to-flag maps, `makeToolAdaptersConfig` builds an adapter config that maps each tool name to an adapter config carrying that tool's ignore flag ([test](tests/test-harness.property.l1.test.ts))
- For all excluded and included path lists, `makeScope` builds a scope result whose excluded and included entries carry exactly those paths ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: the fixture builders are pure — `makeScope`, `makeAdapterConfig`, and `makeToolAdaptersConfig` perform no filesystem, subprocess, or network I/O ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any mocking mechanism — the builders return plain data the tests assert against directly ([audit])
