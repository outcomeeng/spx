# State Store

PROVIDES composable local-state scope addressing and JSONL run/record storage
SO THAT audit, review, test, and compact consumers
CAN persist local execution state without reimplementing `.spx/` paths, branch identity, or append/read mechanics

## Assertions

### Scenarios

- Given main and non-main worktrees in one repository, when branch scope is resolved, then both worktrees address the same `.spx/branch/{branch-slug}` directory ([test](tests/state-store.scenario.l1.test.ts))
- Given main and non-main worktrees in one repository, when worktree scope is resolved, then each worktree addresses its own `.spx/worktree` directory ([test](tests/state-store.scenario.l1.test.ts))
- Given a broader scope and a session token, when the scope is composed, then the session token appears inside the broader scope before the domain directory ([test](tests/state-store.scenario.l1.test.ts))
- Given a run token, when a single-artifact run path is built, then the path is `runs/run-{run-token}.jsonl` ([test](tests/state-store.scenario.l1.test.ts))

### Properties

- Branch slugging is deterministic, path-separator-free, byte-bounded, and hash-suffixed for every branch identity ([test](tests/branch-identity.property.l1.test.ts))

### Compliance

- ALWAYS: state-store path helpers resolve `.spx/branch/` from the Git common-dir product root and `.spx/worktree/` from the local worktree root ([test](tests/state-store.scenario.l1.test.ts))
- ALWAYS: JSONL append and latest-record reads ignore blank trailing lines and return the last parse-valid record ([test](tests/jsonl-records.scenario.l1.test.ts))
- NEVER: let a scope token containing `/`, `\\`, `.`, or `..` become a path segment ([test](tests/state-store.scenario.l1.test.ts))
