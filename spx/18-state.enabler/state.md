PROVIDES product-root resolution and composable `.spx/` local-state addressing — where a command runs and where its execution state lives — through one module over an injected git runner and filesystem interface, per [`spx/17-state.adr.md`](../17-state.adr.md) and [`spx/15-worktree-management.pdr.md`](../15-worktree-management.pdr.md)
SO THAT the release, spec-domain, change, session, compact, testing, and verification consumers
CAN resolve shared, per-worktree, and tracked product roots, designate the repository main checkout, address `.spx/` branch, changes, worktree, and session scopes, and append and read run records without re-deriving git topology or `.spx/` layout

## Assertions

### Compliance

- ALWAYS: a consumer obtains every product root, `.spx/` scope, and run record through this module's injected-dependency API rather than reading git plumbing or composing `.spx/` paths itself per [`spx/17-state.adr.md`](../17-state.adr.md) ([audit])
- NEVER: this module imports a consumer domain (release, spec, change, session, compact, testing, verification) — the dependency flows from consumer to state, never the reverse per [`spx/17-state.adr.md`](../17-state.adr.md) ([audit])
