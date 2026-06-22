# Session Environment Check

PROVIDES the session-environment diagnose check — classifies the agent session the spec-tree `SessionStart` hook establishes, from the agent session identity, the worktree-claim flag, and the `spx worktree status` round-trip, pairing the verdict with a remediation hint
SO THAT the `spx diagnose` engine in [`spx/54-diagnose.enabler/diagnose.md`](../diagnose.md)
CAN fold session-environment health into the overall environment verdict

## Assertions

### Mappings

- The check classifies the session as working (identity and worktree claim both present and consistent with the round-trip; bucket healthy), identity-only (identity present without a worktree claim; bucket degraded), or silent no-op (the hook ran but established neither identity nor claim; bucket broken) from the agent session identity, the worktree-claim flag, and the `spx worktree status` round-trip; as not-applicable (bucket not-applicable) on a runtime that ships no spec-tree `SessionStart` hook; and as unknown (bucket unknown) when the readings are inconsistent, the round-trip is stale, or a command errors, pairing each verdict with a remediation hint ([test](tests/session-environment.mapping.l1.test.ts))
