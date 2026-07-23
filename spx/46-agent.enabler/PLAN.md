# Agent adapter continuation

Pi session coordination continues through independently governed consumers after native resume support:

1. Extend `spx/46-agent.enabler/32-search.enabler` with Pi session-store parsing and `--agent pi` filtering through the source-owned adapter vocabulary.
2. Extend `spx/36-session.enabler/32-session-identity.enabler` and `spx/37-compact.enabler` with Pi session identity supplied by Pi's session runtime or extension event context.
3. Extend `spx/38-worktree.enabler` controlling-process recognition and lifecycle binding so a live Pi process holds the worktree claim for its full lifetime.
4. Extend `spx/33-harness-environment.enabler` with Pi instruction, plugin, skill, hook, and runtime-configuration reconciliation.
5. Extend `spx/54-diagnose.enabler` with Pi installation and configured-environment readings.
6. Supply `spx/57-methodology-lifecycle.enabler` with the exact native session identity its migration resume, verification evidence, and closure bind to.
