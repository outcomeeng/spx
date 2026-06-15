# Scope Addressing

PROVIDES composable `.spx/` scope addressing — branch (`.spx/branch/{slug}`), per-worktree (`.spx/worktree/`), shared sessions (`.spx/sessions/`), and shared worktree-occupancy claims (`.spx/worktrees/`) — with source-owned branch identity and slugging, per [`spx/18-state.enabler/11-state.pdr.md`](../11-state.pdr.md) and [`spx/17-state.adr.md`](../../17-state.adr.md)
SO THAT the audit, review, testing, compact, session, and worktree-occupancy consumers
CAN address shared branch-scoped, per-worktree, shared session, and shared worktree-occupancy state without composing `.spx/` paths or duplicating branch slugging

## Assertions

### Scenarios

- Given main and non-main worktrees in one repository, when branch scope is resolved, then both worktrees address the same `.spx/branch/{branch-slug}` directory ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given main and non-main worktrees in one repository, when worktree scope is resolved, then each worktree addresses its own `.spx/worktree` directory ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given any worktree of a repository, when sessions scope is resolved, then it is `.spx/sessions` under the Git common-dir product root, the same directory from every worktree ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given any worktree of a repository, when worktrees scope is resolved, then it is `.spx/worktrees` under the Git common-dir product root, the same directory from every worktree ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given a broader scope and a session token, when the scope is composed, then the session token appears inside the broader scope before the domain directory ([test](tests/scope-addressing.scenario.l1.test.ts))

### Properties

- Branch slugging is deterministic, path-separator-free, byte-bounded, and hash-suffixed for every branch identity ([test](tests/branch-identity.property.l1.test.ts))
- For every scope token containing a path separator or relative segment (`/`, `\`, `.`, or `..`), validation rejects it before it becomes a path segment ([test](tests/scope-token.property.l1.test.ts))

### Compliance

- ALWAYS: branch, sessions, and worktrees scope resolve from the Git common-dir product root and worktree scope resolves from the local worktree root, per [`spx/15-worktree-management.pdr.md`](../../15-worktree-management.pdr.md) ([test](tests/scope-addressing.scenario.l1.test.ts))
