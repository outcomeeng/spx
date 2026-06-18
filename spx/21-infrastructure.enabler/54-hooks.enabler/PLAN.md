# PLAN: Hooks

## Startup Guidance Parity

`spx hook run session-start` owns parity with the installed plugin's SessionStart startup guidance: foundation directive, stale-base directive, and queued-work discoverability.

Follow-on work adds model-visible startup guidance to the same hook event while preserving the hook interface and avoiding a domain-specific command surface. The hook runner, identity resolution, env-file exports, and worktree occupancy claim remain the base behavior for that guidance.
