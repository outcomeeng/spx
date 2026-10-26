# State Test Harness

PROVIDES controlled git plumbing and nested-product layouts for the state subtree's tests — a controlled-response `GitDependencies` double (a configurable git runner returning a scripted sequence of command outputs and simulating the non-git and git-error failure modes), a child-process product-root probe that runs the real resolvers under supplied environment overrides, a generator of nested-product layouts that records each layout's declared local product root, and a harness that materializes a layout in a temporary git repository
SO THAT the product-root resolver tests, and other state tests needing controlled git plumbing or nested-product layouts
CAN exercise the resolvers' result-shape mapping over generated git outputs, their non-git and error paths, their git-environment isolation, and their resolution of a product nested inside a repository over generated layouts, with no environment mutation leaking across tests

## Assertions

### Scenarios

- Given a generated nested-product layout with `spx.config.*` at the invocation level and at the repository root, when it is materialized in a temporary git repository, then each placed `spx.config.*` and product spec exists at its declared level carrying that level's title and configuration value, and no other level holds one ([test](tests/nested-product-layout.scenario.l2.test.ts))
- Given a scripted sequence of git command outputs, when the double runs successive git commands, then each invocation returns the next scripted output in order ([test](tests/state-test-harness.scenario.l1.test.ts))
- Given a non-git or git-error failure mode, when a git command runs, then the double returns the configured non-zero exit or rejects the invocation, so a resolver under test reaches its fallback and catch paths ([test](tests/state-test-harness.scenario.l1.test.ts))
- Given a working directory inside a git repository, when the product-root probe runs the resolvers in a child process, then it returns both the worktree and Git-common-dir product roots resolved there ([test](tests/state-test-harness.scenario.l1.test.ts))

### Properties

- For every generated nested-product layout, its declared local product root is the invocation directory when the layout lies outside any repository, and otherwise the nearest level holding a placed `spx.config.*` from the invocation directory up to the repository root, or the repository root when no level holds one ([test](tests/nested-product-layout.property.l1.test.ts))
- For every generated nested-product layout, the product titles and configuration values of its placed levels are pairwise distinct ([test](tests/nested-product-layout.property.l1.test.ts))
