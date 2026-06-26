# PLAN: Hooks

## Startup Guidance Parity

`spx hook run session-start` owns parity with the installed plugin's SessionStart startup guidance: foundation directive, stale-base directive, and queued-work discoverability.

The compact-source foundation directive is in place: on the `compact` lifecycle source the hook emits a model-visible re-anchor directive to stdout (see the scenario and compliance assertions in `hooks.md` and product property 4 in `spx/21-infrastructure.enabler/54-hooks.enabler/21-hook-event-runner.pdr.md`).

Remaining startup-guidance parity:

- the stale-base directive,
- queued-work discoverability,
- any foundation directive on non-compact starts where the foundation is not yet loaded.

These add further model-visible startup guidance to the same hook event while preserving the hook interface and avoiding a domain-specific command surface. The hook runner, identity resolution, env-file exports, and worktree occupancy claim remain the base behavior for that guidance.
