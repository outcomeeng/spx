PROVIDES product-root resolution, host-scoped root resolution, and composable `.spx/` local-state addressing — where a command runs and where its execution state lives — through one module over an injected git runner, OS account-record probe, environment reader, and filesystem interface, per [spx/17-state.adr.md](spx/17-state.adr.md) and [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md)
SO THAT the release, spec-domain, change, session, compact, testing, verification, and build-slot consumers
CAN resolve shared, per-worktree, tracked, and host-scoped roots, designate the repository main checkout, address `.spx/` branch, changes, worktree, and session scopes, and append and read run records without re-deriving git topology, `.spx/` layout, or host state locations

## Assertions

- Given an OS account record naming a home directory, when the host rendezvous root resolves under any `HOME`, `XDG_STATE_HOME`, invocation directory, and repository, then it is `<account-home>/.local/state/spx/` ([test](tests/host-root.property.l1.test.ts))
- Given `XDG_STATE_HOME` holding an absolute path, when the host state root resolves, then it is `$XDG_STATE_HOME/spx/`; given a relative or empty value or no value, then it is `<account-home>/.local/state/spx/` ([test](tests/host-root.property.l1.test.ts))

### Compliance

- ALWAYS: a consumer obtains every product root, host-scoped root, `.spx/` scope, and run record through this module's injected-dependency API rather than reading git plumbing, `HOME`, `XDG_STATE_HOME`, or the account record, or composing `.spx/` paths itself per [spx/17-state.adr.md](spx/17-state.adr.md) ([audit])
- NEVER: this module imports a consumer domain (release, spec, change, session, compact, testing, verification, build slot) — the dependency flows from consumer to state, never the reverse per [spx/17-state.adr.md](spx/17-state.adr.md) ([audit])
