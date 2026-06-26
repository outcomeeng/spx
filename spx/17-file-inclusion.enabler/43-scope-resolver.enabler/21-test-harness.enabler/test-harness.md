# Scope Resolver Test Harness

PROVIDES scope-resolver fixtures — an empty resolver config, generator-sampled git-worktree paths for tracked, untracked, ignored, domain-excluded, domain-included, and include-miss roles, a `makeResolverState` builder, and a `writeScopeResolverFixture` git-worktree writer
SO THAT the scope-resolver enabler's L1 scenario, property, and compliance tests
CAN assemble layered scope decisions over real git worktrees without hardcoded path examples or reimplemented layer-state setup

## Assertions

### Scenarios

- Given the curated fixture set, when `writeScopeResolverFixture` runs against a git-worktree env, then the tracked exemplar paths are materialized in git's cached file set ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: every path, ignore pattern, and file-content fixture comes from `testing/generators/` through the harness, never from hardcoded literals in tests ([audit])
- ALWAYS: fixture writing goes through the git-worktree env, which owns temp-directory lifecycle, git initialization, and `GIT_*` isolation ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — resolver tests run against real git worktrees ([audit])
