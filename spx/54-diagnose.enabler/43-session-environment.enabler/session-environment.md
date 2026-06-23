# Session Environment Check

PROVIDES the session-environment diagnose check — classifies the agent session the spec-tree `SessionStart` hook establishes, from the agent session identity and the `spx worktree status` occupancy of the current worktree, pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-environment health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session as working (identity present and the current worktree reads `running`; bucket healthy), identity-only (identity present while the current worktree reads `free` — the hook set the identity but no live claim holds the worktree; bucket degraded), or silent no-op (the hook ran but established neither identity nor a `running` worktree; bucket broken) from the agent session identity and the `spx worktree status` occupancy of the current worktree; as not-applicable (bucket not-applicable) on a runtime that ships no spec-tree `SessionStart` hook; and as unknown (bucket unknown) when a command errors, pairing each verdict with a remediation hint ([test](tests/session-environment.mapping.l1.test.ts))
