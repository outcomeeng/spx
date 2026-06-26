# PLAN: Hooks

## Startup Guidance Parity

`spx hook run session-start` owns parity with the installed plugin's SessionStart startup guidance. The remaining parity work:

- the stale-base directive,
- queued-work discoverability,
- a foundation directive on non-compact starts where the foundation is not yet loaded.

These add model-visible startup guidance to the same hook event while preserving the hook interface and avoiding a domain-specific command surface. The hook runner, identity resolution, env-file exports, and worktree occupancy claim remain the base behavior for that guidance.
