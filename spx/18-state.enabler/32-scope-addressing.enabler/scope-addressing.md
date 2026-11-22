PROVIDES composable local state scope addressing, with branch, per-worktree, shared change, shared draft, shared session, and shared worktree-occupancy scopes, and source-owned branch identity and slugging
SO THAT the verification, testing, compact, change, draft, session, and worktree-occupancy consumers
CAN address shared branch-scoped, per-worktree, shared change, shared draft, shared session, and shared worktree-occupancy state without composing state directory paths or duplicating branch slugging

## Assertions

### Scenarios

- Given main and non-main worktrees in one repository, when branch scope is resolved, then both worktrees address the same `.spx/branch/{branch-slug}` directory ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given main and non-main worktrees in one repository, when worktree scope is resolved, then each worktree addresses its own `.spx/worktree` directory ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given any worktree of a repository, when sessions scope is resolved, then it is `.spx/sessions` under the Git common-dir product root, the same directory from every worktree ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given any worktree of a repository, when changes scope is resolved, then it is `.spx/changes` under the Git common-dir product root, the same directory from every worktree ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given any worktree of a repository, when worktrees scope is resolved, then it is `.spx/worktrees` under the Git common-dir product root, the same directory from every worktree ([test](tests/scope-addressing.scenario.l1.test.ts))
- Given a broader scope and a session token, when the scope is composed, then the session token appears inside the broader scope before the domain directory ([test](tests/scope-addressing.scenario.l1.test.ts))

### Test.Scenario: drafts scope

- drafts-scope-shared:
  - Given a Git repository with its main worktree and one linked worktree
  - When the drafts scope is resolved once from the main worktree and once from the linked worktree
  - Then both resolutions return the same one directory, `.spx/drafts` under the Git common-dir product root, and neither returns a directory under a worktree's `.spx/worktree/`

### Audit: drafts scope

- shared-drafts-scope: ALWAYS: scope addressing resolves repository-shared drafts to `.spx/drafts` under the Git common-dir product root, never to a branch-scoped or worktree-scoped directory

### Properties

- Branch slugging is deterministic, path-separator-free, byte-bounded, and hash-suffixed for every branch identity ([test](tests/branch-identity.property.l1.test.ts))
- For every scope token containing a path separator or relative segment (`/`, `\`, `.`, or `..`), validation rejects it before it becomes a path segment ([test](tests/scope-token.property.l1.test.ts))
