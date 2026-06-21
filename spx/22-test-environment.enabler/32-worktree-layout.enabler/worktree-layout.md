# Worktree Layout

PROVIDES a callback-scoped harness that provisions a real git worktree layout in temp directories — a bare-repository pool or a non-bare repository, each with the worktrees a spec declares — resolves every worktree's absolute path by name, and strips and restores `GIT_*` process environment around the callback
SO THAT the worktree-topology, product-root, state, session, and worktree-CLI tests
CAN exercise the main-checkout detector and worktree-scoped behavior against real multi-worktree git layouts without hand-rolled git scaffolding or leaked `GIT_*` context

## Assertions

### Scenarios

- Given a provisioned layout, when `worktree(name)` resolves a provisioned name, then its absolute path is returned, and resolving a name that was not provisioned throws ([test](tests/worktree-layout.scenario.l1.test.ts))
- Given a non-bare layout that declares no worktrees, when the harness provisions it, then provisioning throws because a non-bare layout needs at least the main working tree ([test](tests/worktree-layout.scenario.l1.test.ts))
- Given a `GIT_*` variable set in `process.env`, when the harness runs the callback, then the variable is stripped for the callback's duration and restored to its prior value after the callback completes, whether it returns or throws ([test](tests/worktree-layout.scenario.l1.test.ts))
