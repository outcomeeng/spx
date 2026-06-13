# State Test Harness

PROVIDES controlled git plumbing for the state subtree's tests — a controlled-response `GitDependencies` double (a configurable git runner returning a scripted sequence of command outputs and simulating the non-git and git-error failure modes) and a child-process product-root probe that runs the real resolvers under supplied environment overrides
SO THAT the product-root resolver tests, and other state tests needing controlled git plumbing
CAN exercise the resolvers' result-shape mapping over generated git outputs, their non-git and error paths, and their git-environment isolation without constructing a real repository per case or leaking environment mutation across tests

## Assertions

### Scenarios

- Given a scripted sequence of git command outputs, when the double runs successive git commands, then each invocation returns the next scripted output in order ([test](tests/state-test-harness.scenario.l1.test.ts))
- Given a non-git or git-error failure mode, when a git command runs, then the double returns the configured non-zero exit or rejects the invocation, so a resolver under test reaches its fallback and catch paths ([test](tests/state-test-harness.scenario.l1.test.ts))
- Given a working directory inside a git repository, when the product-root probe runs the resolvers in a child process, then it returns both the worktree and Git-common-dir product roots resolved there ([test](tests/state-test-harness.scenario.l1.test.ts))
