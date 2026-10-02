# Ignore Source Test Harness

PROVIDES generator-sampled ignore-source fixtures — reader config builders, git-worktree path samples, ignore patterns, file content samples, submodule paths, bogus git directories, and property limits
SO THAT the ignore-source enabler's L1 scenario, property, mapping, and compliance tests
CAN build real git-worktree reader inputs without hardcoded path, pattern, or content literals

## Assertions

### Properties

- For all override combinations, `readerConfig` returns the structured reader config shape with the supplied overrides preserved ([test](tests/test-harness.property.l1.test.ts))
- For all sampled fixture roles, the harness returns non-empty path, ignore-pattern, and file-content values suitable for git-worktree reader tests ([test](tests/test-harness.property.l1.test.ts))

### Compliance

- ALWAYS: every path, ignore pattern, file content, submodule path, and bogus git directory fixture comes from `testing/generators/git-worktree/` through the harness ([audit])
- ALWAYS: reader config construction stays structured as `IgnoreSourceReaderConfig`, never free-form git argument arrays ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — ignore-source tests construct real git worktrees through the git-worktree harness ([audit])
