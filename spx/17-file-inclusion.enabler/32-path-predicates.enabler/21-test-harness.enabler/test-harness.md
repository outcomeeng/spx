# Path Predicates Test Harness

PROVIDES generator-backed path-predicates fixtures — sampled git-visible paths, generated path prefixes, a `makeGitTrackingState` reader-state builder, and a `pathFilter` config helper
SO THAT the path-predicates enabler's L1 scenario and property tests
CAN exercise git-tracking and domain-path-filter predicates without hardcoded path examples or reimplemented reader state

## Assertions

### Properties

- For all generated predicate inputs, `makeGitTrackingState` returns reader state whose membership result matches the included-path set passed to the helper ([test](tests/test-harness.property.l1.test.ts))
- For all generated path prefixes, `pathFilter` preserves the supplied include or exclude config unchanged ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: every path or prefix fixture comes from `testing/generators/` through the harness, never from a hardcoded test literal ([audit])
- ALWAYS: predicate tests import production layer constants and predicate functions from source, while the harness owns only generated inputs and reader-state construction ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — predicate tests use in-memory reader state or real git-worktree fixtures owned by the relevant harness ([audit])
